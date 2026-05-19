// ============================================================================
// Action executor — child-process isolation with Node's permission model
// ============================================================================
// Predecessor used `node:vm` (NOT a security boundary — sandboxed code could
// reach host globals via `Buffer.constructor("return process")()` and friends).
// This rewrite spawns user code in a separate Node process locked down with
// the permission model:
//
//   --permission                    enable the model (default-deny)
//   --allow-fs-read=<repo>          read-only fs (modules must be loadable)
//   --no-warnings                   silence experimental-flag noise
//
// Implicitly denied: fs-write, child_process, worker_threads, addons, wasi.
// Network is always allowed under the permission model (Node design choice),
// which is what we want — user code needs to make RPC calls.
//
// The child runs an embedded ESM script via `--eval` so there's no separate
// runner file to ship in dev vs. prod. Parent and child communicate over the
// child's stdin/stdout: one JSON line in (the action context), one JSON line
// out (the result).
//
// Limitations to be aware of:
//   - Fs-read is granted to the whole repo so Node can resolve modules. User
//     code can read source files but cannot read .env (which is filtered out
//     of the child env block below).
//   - Spawning costs ~50-100ms. Fine for scheduled actions; would be tight
//     for sub-100ms hot paths.
//   - `process.env` is filtered before spawn so the child sees only the RPC
//     URL — not Postgres creds, API keys, or anything else from the parent.
// ============================================================================

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ActionRow,
  getActionStorage,
  setActionStorage,
  addLog,
} from "./actionsDb.js";

// ---------------------------------------------------------------------------
// Types — preserved verbatim from the previous executor so callers don't
// need to change.
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  duration_ms: number;
  error?: string;
}

export interface TriggerEvent {
  type: string;
  blockNumber?: number;
  txHash?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Wire payload between parent and child
// ---------------------------------------------------------------------------

interface ChildInput {
  code: string;
  event: TriggerEvent;
  secrets: Record<string, string>;
  storage: Record<string, unknown>;
  rpcUrl: string;
  timeoutMs: number;
}

interface ChildOutput {
  stdout: string[];
  stderr: string[];
  storage: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Repo-root resolution — we hand `--allow-fs-read` this path so Node can
// resolve node_modules. Computed once at module load.
// ---------------------------------------------------------------------------

const REPO_ROOT = (() => {
  // dirname(this file) → packages/api/{src|dist}/services → walk up to repo root
  const here = path.dirname(fileURLToPath(import.meta.url));
  // here: <repo>/packages/api/(src|dist)/services
  return path.resolve(here, "..", "..", "..", "..");
})();

const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// The child script — embedded as a string so there's no separate file to
// resolve across dev (tsx) and prod (node). Reads one JSON line from stdin,
// writes one JSON line to stdout. Captures console.* output for streaming
// back to the parent.
// ---------------------------------------------------------------------------

const CHILD_SCRIPT = String.raw`
import { createPublicClient, http, formatEther } from "viem";

// --- read full stdin -------------------------------------------------------
let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw);

// --- captured streams ------------------------------------------------------
const stdoutLines = [];
const stderrLines = [];
const capturedConsole = {
  log:  (...a) => stdoutLines.push(a.map(String).join(" ")),
  warn: (...a) => stderrLines.push("[warn] " + a.map(String).join(" ")),
  error:(...a) => stderrLines.push("[error] " + a.map(String).join(" ")),
  info: (...a) => stdoutLines.push("[info] " + a.map(String).join(" ")),
};

// --- viem client (read-only) ----------------------------------------------
const publicClient = createPublicClient({ transport: http(input.rpcUrl) });

const rpc = {
  async call(to, data) {
    const r = await publicClient.call({ to, data });
    return r.data ?? "0x";
  },
  async getBalance(address) {
    return formatEther(await publicClient.getBalance({ address }));
  },
  async getBlock(number) {
    const b = await publicClient.getBlock(
      number !== undefined ? { blockNumber: BigInt(number) } : {},
    );
    return {
      number: Number(b.number),
      hash: b.hash,
      timestamp: Number(b.timestamp),
      gasUsed: b.gasUsed.toString(),
      gasLimit: b.gasLimit.toString(),
      baseFeePerGas: b.baseFeePerGas?.toString(),
      transactionCount: b.transactions.length,
    };
  },
  async getTransaction(hash) {
    const tx = await publicClient.getTransaction({ hash });
    return {
      hash: tx.hash, from: tx.from, to: tx.to,
      value: formatEther(tx.value), nonce: tx.nonce,
      gas: tx.gas.toString(),
      blockNumber: tx.blockNumber ? Number(tx.blockNumber) : null,
      input: tx.input,
    };
  },
  async getTransactionReceipt(hash) {
    const r = await publicClient.getTransactionReceipt({ hash });
    return {
      status: r.status, gasUsed: r.gasUsed.toString(),
      blockNumber: Number(r.blockNumber),
      logs: r.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })),
    };
  },
  async getLogs(params) {
    const logs = await publicClient.getLogs({
      address: params.address,
      fromBlock: params.fromBlock !== undefined ? BigInt(params.fromBlock) : undefined,
      toBlock:   params.toBlock   !== undefined ? BigInt(params.toBlock)   : undefined,
    });
    return logs.map((l) => ({
      address: l.address, topics: [...l.topics], data: l.data,
      blockNumber: l.blockNumber ? Number(l.blockNumber) : null,
      transactionHash: l.transactionHash,
    }));
  },
};

// --- storage proxy ---------------------------------------------------------
const storageData = { ...(input.storage ?? {}) };
const storage = {
  get(k)    { return storageData[k]; },
  set(k, v) { storageData[k] = v; },
  getAll()  { return { ...storageData }; },
  delete(k) { delete storageData[k]; },
};

// --- compile + run user code ----------------------------------------------
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

// --- emit one JSON line on stdout -----------------------------------------
process.stdout.write(JSON.stringify({
  stdout: stdoutLines, stderr: stderrLines, storage: storageData, error,
}) + "\n");
`;

// ---------------------------------------------------------------------------
// Allow-list of env vars the child receives. Everything else is dropped so
// Postgres creds, API keys, etc. don't bleed into user code.
// ---------------------------------------------------------------------------

const ALLOWED_ENV_VARS: ReadonlySet<string> = new Set([
  "NODE_OPTIONS", // permits `--no-warnings` style tweaks if needed by tooling
  "PATH",         // node binary resolution
]);

function filteredEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of ALLOWED_ENV_VARS) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spawn the child + drive the request/response. Times out hard.
// ---------------------------------------------------------------------------

function runInChild(input: ChildInput): Promise<ChildOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--permission",
        `--allow-fs-read=${REPO_ROOT}`,
        "--no-warnings",
        "--input-type=module",
        "--eval",
        CHILD_SCRIPT,
      ],
      {
        cwd: REPO_ROOT,
        env: filteredEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdoutBuf = "";
    let stderrBuf = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
      reject(new Error(`Action execution timed out (${input.timeoutMs}ms)`));
    }, input.timeoutMs);
    timer.unref();

    child.stdout.on("data", (b) => (stdoutBuf += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderrBuf += b.toString("utf8")));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && !stdoutBuf.trim()) {
        // The child crashed before emitting any output — surface stderr as
        // an error message rather than failing with a generic JSON parse error.
        reject(
          new Error(
            `Child process exited with code ${code}: ${stderrBuf.trim() || "no output"}`,
          ),
        );
        return;
      }
      try {
        // The child can emit warnings on stderr that we want to preserve, but
        // the protocol payload is the LAST non-empty line on stdout — newline
        // terminated.
        const lastLine = stdoutBuf.trim().split("\n").pop() ?? "";
        const parsed = JSON.parse(lastLine) as ChildOutput;
        // Pass through any stderr the child emitted (Node warnings, etc.).
        if (stderrBuf.trim()) parsed.stderr.push(...stderrBuf.trim().split("\n"));
        resolve(parsed);
      } catch (e) {
        reject(
          new Error(
            `Failed to parse child output: ${(e as Error).message}. ` +
              `stdout=${stdoutBuf.slice(0, 500)} stderr=${stderrBuf.slice(0, 500)}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Public API — same signature and ExecutionResult shape as the previous
// node:vm executor, so callers in routes/actions.ts and actionScheduler.ts
// don't need to change.
// ---------------------------------------------------------------------------

export async function executeAction(
  action: ActionRow,
  triggerEvent: TriggerEvent,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const secrets = (action.secrets ?? {}) as Record<string, string>;
  const storageData = await getActionStorage(action.id);

  const rpcUrl =
    process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com";

  try {
    const result = await runInChild({
      code: action.code,
      event: triggerEvent,
      secrets,
      storage: storageData,
      rpcUrl,
      timeoutMs: TIMEOUT_MS,
    });

    // Persist whatever the action mutated. The child returned a fresh object;
    // we replace storage wholesale (consistent with the previous executor's
    // setActionStorage call after script.runInContext).
    await setActionStorage(action.id, result.storage);

    const duration = Date.now() - startTime;
    const success = result.error === undefined;
    const final: ExecutionResult = {
      success,
      stdout: result.stdout.join("\n"),
      stderr: result.stderr.join("\n"),
      duration_ms: duration,
      ...(success ? {} : { error: result.error }),
    };

    await addLog({
      action_id: action.id,
      duration_ms: duration,
      success,
      stdout: final.stdout,
      stderr: final.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return final;
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    const final: ExecutionResult = {
      success: false,
      stdout: "",
      stderr: `[fatal] ${errorMessage}`,
      duration_ms: duration,
      error: errorMessage,
    };

    await addLog({
      action_id: action.id,
      duration_ms: duration,
      success: false,
      stdout: final.stdout,
      stderr: final.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return final;
  }
}
