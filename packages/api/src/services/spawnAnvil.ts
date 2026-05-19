import { spawn, type ChildProcess } from "node:child_process";
import { waitForPort } from "./forkClient.js";

const FOUNDRY_INSTALL_HINT =
  "Is Foundry installed? Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup";

export interface SpawnAnvilOptions {
  /** Local port to bind anvil to. */
  port: number;
  /** Upstream RPC to fork. */
  rpcUrl: string;
  /** Pin the fork at a specific block height; omit for "latest". */
  blockNumber?: number;
}

/**
 * Spawn an `anvil --fork-url ...` child process bound to loopback, wait for
 * it to start answering JSON-RPC, and return the child handle. Throws a
 * descriptive error (with the Foundry install hint) on every failure mode:
 * command not found, immediate exit, slow start.
 *
 * The 127.0.0.1 binding is non-negotiable: an authoritative-mode anvil
 * exposed on 0.0.0.0 lets anyone on the local network call
 * `anvil_setBalance` / `anvil_setStorageAt` / `anvil_impersonateAccount`
 * against forked state. The API process is the only thing that should
 * reach these forks.
 */
export async function spawnAnvil(
  options: SpawnAnvilOptions,
): Promise<ChildProcess> {
  const { port, rpcUrl, blockNumber } = options;

  const args: string[] = [
    "--fork-url",
    rpcUrl,
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "--silent",
  ];

  if (typeof blockNumber === "number") {
    args.push("--fork-block-number", String(blockNumber));
  }

  let child: ChildProcess;
  try {
    child = spawn("anvil", args, {
      stdio: "pipe",
      detached: false,
    });
  } catch {
    throw new Error(`Failed to spawn anvil. ${FOUNDRY_INSTALL_HINT}`);
  }

  // Race spawn errors (command not found etc.) against a short success window.
  const spawnError = await new Promise<Error | null>((resolve) => {
    child.on("error", (err) => resolve(err));
    setTimeout(() => resolve(null), 500);
  });

  if (spawnError) {
    throw new Error(
      `Failed to start anvil: ${spawnError.message}. ${FOUNDRY_INSTALL_HINT}`,
    );
  }

  if (child.exitCode !== null) {
    throw new Error(
      `anvil exited immediately with code ${child.exitCode}. ` +
        "Check that the port is not in use and Foundry is installed correctly.",
    );
  }

  try {
    await waitForPort(port);
  } catch {
    child.kill("SIGTERM");
    throw new Error(
      `anvil started but RPC is not responding on port ${port}. ` +
        "The fork URL may be unreachable or the block number may be invalid.",
    );
  }

  return child;
}
