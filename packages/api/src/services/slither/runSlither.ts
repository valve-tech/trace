import { spawn } from "node:child_process";

export interface SlitherProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run Slither inside the trailofbits eth-security-toolbox Docker image
 * against a prepared project directory. `solc-select` installs and pins
 * the requested compiler version, then `slither . --json /dev/stdout`
 * emits findings on stdout.
 *
 * The `|| true` after slither keeps the container exit code at 0 even
 * when slither finds issues — we want the JSON output, not an exit-code
 * gate. The 120s timeout is the only hard backstop against a runaway
 * analysis.
 */
export function runSlitherProcess(
  projectDir: string,
  solcVersion: string,
): Promise<SlitherProcessResult> {
  return new Promise((resolve) => {
    const args = [
      "run",
      "--rm",
      "-v",
      `${projectDir}:/project`,
      "-w",
      "/project",
      "trailofbits/eth-security-toolbox",
      "bash",
      "-c",
      `solc-select install ${solcVersion} && solc-select use ${solcVersion} && slither . --json /dev/stdout 2>/dev/stderr || true`,
    ];

    const proc = spawn("docker", args, {
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      resolve({ stdout: "", stderr: err.message, exitCode: 1 });
    });
  });
}
