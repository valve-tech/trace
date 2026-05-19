// Smoke test for the rewritten action executor's CHILD process. Spawns the
// child with the same permission flags the executor uses, sends a synthetic
// action payload, and verifies:
//   1. A trivial action prints to stdout
//   2. The storage write made by the action is returned
//   3. An attempt to write the filesystem is BLOCKED by --permission
//   4. An attempt to spawn a child process is BLOCKED by --permission
//   5. A user error surfaces in the output, not as a hang
//
// Run with:
//   npx tsx packages/api/tests/actionExecutor.smoke.ts
//
// This test does not touch Postgres — it exercises the spawn path directly,
// which is the part with security-critical behavior.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
);

// Inline copy of the executor's CHILD_SCRIPT — kept in sync manually so the
// smoke test runs without needing to import the executor module (which would
// drag in the actionsDb / pg dependency).
const CHILD_SCRIPT = String.raw`
import { createPublicClient, http, formatEther } from "viem";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw);

const stdoutLines = [];
const stderrLines = [];
const capturedConsole = {
  log:  (...a) => stdoutLines.push(a.map(String).join(" ")),
  warn: (...a) => stderrLines.push("[warn] " + a.map(String).join(" ")),
  error:(...a) => stderrLines.push("[error] " + a.map(String).join(" ")),
  info: (...a) => stdoutLines.push("[info] " + a.map(String).join(" ")),
};
const publicClient = createPublicClient({ transport: http(input.rpcUrl) });
const rpc = {};

const storageData = { ...(input.storage ?? {}) };
const storage = {
  get(k)    { return storageData[k]; },
  set(k, v) { storageData[k] = v; },
  getAll()  { return { ...storageData }; },
  delete(k) { delete storageData[k]; },
};

let error;
try {
  const userFn = new (Object.getPrototypeOf(async function () {}).constructor)(
    "console", "event", "rpc", "secrets", "storage",
    input.code + "\nif (typeof handler === 'function') { return await handler({ event, rpc, secrets, storage }); }",
  );
  await userFn(capturedConsole, input.event, rpc, input.secrets ?? {}, storage);
} catch (e) {
  error = e instanceof Error ? e.message : String(e);
  stderrLines.push("[fatal] " + error);
}

process.stdout.write(JSON.stringify({
  stdout: stdoutLines, stderr: stderrLines, storage: storageData, error,
}) + "\n");
`;

interface ChildOutput {
  stdout: string[];
  stderr: string[];
  storage: Record<string, unknown>;
  error?: string;
}

function runChild(payload: object): Promise<ChildOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--permission",
        `--allow-fs-read=${REPO_ROOT}`,
        "--no-warnings",
        "--input-type=module",
        "--eval", CHILD_SCRIPT,
      ],
      {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdoutBuf = "";
    let stderrBuf = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("timeout"));
    }, 15_000);
    child.stdout.on("data", (b) => (stdoutBuf += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderrBuf += b.toString("utf8")));
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const last = stdoutBuf.trim().split("\n").pop() ?? "";
        const parsed = JSON.parse(last) as ChildOutput;
        if (stderrBuf.trim()) parsed.stderr.push(...stderrBuf.trim().split("\n"));
        resolve(parsed);
      } catch (e) {
        reject(new Error(`code=${code} stderr=${stderrBuf} parseErr=${(e as Error).message}`));
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

let failed = 0;

// 1. happy path
{
  const r = await runChild({
    code: `
      async function handler({ event, storage, secrets }) {
        console.log("hello from child");
        console.log("event.type =", event.type);
        console.log("secret length:", secrets.API_KEY.length);
        storage.set("count", (storage.get("count") ?? 0) + 1);
      }
    `,
    event: { type: "manual", blockNumber: 1 },
    secrets: { API_KEY: "shh" },
    storage: {},
    rpcUrl: "https://rpc.pulsechain.com",
  });
  console.log("--- happy path ---");
  console.log(r);
  if (r.error) failed++;
  if (!r.stdout.some((l) => l.includes("hello from child"))) failed++;
  if (r.storage.count !== 1) failed++;
}

// 2. fs-write must be blocked
{
  const r = await runChild({
    code: `
      async function handler() {
        const fs = await import("node:fs/promises");
        try {
          await fs.writeFile("/tmp/should-not-exist-12345.txt", "x");
          console.log("WRITE SUCCEEDED — permission model broken");
        } catch (e) {
          console.log("WRITE BLOCKED:", e.code || e.message);
        }
      }
    `,
    event: {}, secrets: {}, storage: {}, rpcUrl: "https://rpc.pulsechain.com",
  });
  console.log("--- fs-write boundary ---");
  console.log(r);
  if (r.error) failed++;
  if (!r.stdout.some((l) => l.includes("WRITE BLOCKED"))) failed++;
}

// 3. child_process must be blocked
{
  const r = await runChild({
    code: `
      async function handler() {
        const cp = await import("node:child_process");
        try {
          cp.spawnSync("ls", ["/"]);
          console.log("SPAWN SUCCEEDED — permission model broken");
        } catch (e) {
          console.log("SPAWN BLOCKED:", e.code || e.message);
        }
      }
    `,
    event: {}, secrets: {}, storage: {}, rpcUrl: "https://rpc.pulsechain.com",
  });
  console.log("--- spawn boundary ---");
  console.log(r);
  if (r.error) failed++;
  if (!r.stdout.some((l) => l.includes("SPAWN BLOCKED"))) failed++;
}

// 4. user error must surface
{
  const r = await runChild({
    code: `async function handler() { throw new Error("boom from user code"); }`,
    event: {}, secrets: {}, storage: {}, rpcUrl: "https://rpc.pulsechain.com",
  });
  console.log("--- user error ---");
  console.log(r);
  if (!r.error?.includes("boom from user code")) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nALL FOUR SMOKE TESTS PASSED.");
