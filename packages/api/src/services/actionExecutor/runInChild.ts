import { spawn } from "node:child_process";
import type { ChildInput, ChildOutput } from "./types.js";
import { REPO_ROOT, filteredEnv } from "./childEnv.js";
import { CHILD_SCRIPT } from "./childScript.js";

/**
 * Spawn a sandboxed Node child running CHILD_SCRIPT, drive the
 * request/response over stdin/stdout, and time out hard.
 *
 * Sandbox flags:
 *   --permission                    enable Node's permission model
 *   --allow-fs-read=<REPO_ROOT>     read-only fs scoped to the repo
 *   --no-warnings                   silence experimental-flag noise
 *
 * The model implicitly denies fs-write, child_process, worker_threads,
 * native addons, and wasi. Network is always allowed under the model
 * (Node design choice) — which we want, since user code needs to make
 * RPC calls.
 */
export function runInChild(input: ChildInput): Promise<ChildOutput> {
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
        // Child crashed before emitting any output — surface stderr
        // rather than a generic JSON parse error.
        reject(
          new Error(
            `Child process exited with code ${code}: ${stderrBuf.trim() || "no output"}`,
          ),
        );
        return;
      }
      try {
        // The protocol payload is the LAST non-empty line on stdout. The
        // child can also emit non-protocol output before that (Node
        // warnings, console.log calls during module init) which we
        // surface via stderr.
        const lastLine = stdoutBuf.trim().split("\n").pop() ?? "";
        const parsed = JSON.parse(lastLine) as ChildOutput;
        if (stderrBuf.trim()) {
          parsed.stderr.push(...stderrBuf.trim().split("\n"));
        }
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
