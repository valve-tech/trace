import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface SolcProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Build a solc standard-json sources object from every `.sol` file in
 * `dir` (recursively). Path keys are POSIX-style relative to `dir` so
 * the input survives copying between platforms.
 */
export function buildSolcSources(
  dir: string,
): Record<string, { content: string }> {
  const sources: Record<string, { content: string }> = {};

  function walk(currentDir: string, prefix: string): void {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(
          path.join(currentDir, entry.name),
          prefix ? `${prefix}/${entry.name}` : entry.name,
        );
      } else if (entry.name.endsWith(".sol")) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const content = fs.readFileSync(
          path.join(currentDir, entry.name),
          "utf-8",
        );
        sources[relPath] = { content };
      }
    }
  }

  walk(dir, "");
  return sources;
}

/**
 * Spawn `solc --standard-json` with the project's sources piped in,
 * returning stdout/stderr/exitCode. The input JSON is also written to
 * `solc-input.json` in the project dir for post-mortem debugging.
 *
 * 60s timeout — large projects with lots of imports can take a while,
 * but never longer than this in practice.
 */
export function runSolc(
  projectDir: string,
  _solcVersion: string,
  solcBinary: string,
): Promise<SolcProcessResult> {
  return new Promise((resolve) => {
    const solcInput = JSON.stringify({
      language: "Solidity",
      sources: buildSolcSources(projectDir),
      settings: {
        outputSelection: {
          "*": {
            "*": [
              "abi",
              "storageLayout",
              "evm.deployedBytecode.sourceMap",
              "evm.deployedBytecode.object",
            ],
          },
        },
        optimizer: { enabled: true, runs: 200 },
      },
    });

    fs.writeFileSync(
      path.join(projectDir, "solc-input.json"),
      solcInput,
      "utf-8",
    );

    const proc = spawn(solcBinary, ["--standard-json"], {
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: projectDir,
    });

    proc.stdin.write(solcInput);
    proc.stdin.end();

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
