import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Fork {
  id: string;
  port: number;
  rpcUrl: string;
  blockNumber: number | "latest";
  label: string;
  createdAt: Date;
  pid: number;
}

export interface CreateForkOptions {
  blockNumber?: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// JSON-RPC helper
// ---------------------------------------------------------------------------

async function sendRpc(
  port: number,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`RPC call ${method} failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    result?: unknown;
    error?: { message: string; code: number };
  };

  if (json.error) {
    throw new Error(`RPC error (${json.error.code}): ${json.error.message}`);
  }

  return json.result;
}

// ---------------------------------------------------------------------------
// Port availability helper
// ---------------------------------------------------------------------------

async function isPortListening(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "web3_clientVersion",
        params: [],
      }),
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForPort(
  port: number,
  timeoutMs: number = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortListening(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Timed out waiting for anvil to start on port ${port} after ${timeoutMs}ms`,
  );
}

// ---------------------------------------------------------------------------
// ForkManager
// ---------------------------------------------------------------------------

const RPC_URL =
  process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com";

/** Default TTL for forks: 1 hour. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export class ForkManager {
  private forks = new Map<string, Fork>();
  private processes = new Map<string, ChildProcess>();
  private nextPort = 8545;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.startAutoCleanup();
    this.registerExitHandlers();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async createFork(options: CreateForkOptions = {}): Promise<Fork> {
    const id = crypto.randomUUID();
    const label = options.label || `Fork ${this.forks.size + 1}`;
    const blockNumber = options.blockNumber ?? "latest";

    // Find an available port
    const port = await this.findAvailablePort();

    // Build anvil args
    const args: string[] = [
      "--fork-url",
      RPC_URL,
      "--port",
      String(port),
      "--host",
      "0.0.0.0",
      "--silent",
    ];

    if (typeof blockNumber === "number") {
      args.push("--fork-block-number", String(blockNumber));
    }

    // Spawn anvil process
    let child: ChildProcess;
    try {
      child = spawn("anvil", args, {
        stdio: "pipe",
        detached: false,
      });
    } catch {
      throw new Error(
        "Failed to spawn anvil. Is Foundry installed? " +
          "Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup",
      );
    }

    // Handle spawn errors (e.g. command not found)
    const spawnError = await new Promise<Error | null>((resolve) => {
      child.on("error", (err) => resolve(err));
      // Give the process a moment to fail or succeed
      setTimeout(() => resolve(null), 500);
    });

    if (spawnError) {
      throw new Error(
        `Failed to start anvil: ${spawnError.message}. ` +
          "Is Foundry installed? Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup",
      );
    }

    // Check if process exited immediately
    if (child.exitCode !== null) {
      throw new Error(
        `anvil exited immediately with code ${child.exitCode}. ` +
          "Check that the port is not in use and Foundry is installed correctly.",
      );
    }

    // Wait for anvil to become responsive
    try {
      await waitForPort(port);
    } catch {
      child.kill("SIGTERM");
      throw new Error(
        `anvil started but RPC is not responding on port ${port}. ` +
          "The fork URL may be unreachable or the block number may be invalid.",
      );
    }

    const fork: Fork = {
      id,
      port,
      rpcUrl: `http://localhost:${port}`,
      blockNumber,
      label,
      createdAt: new Date(),
      pid: child.pid ?? 0,
    };

    this.forks.set(id, fork);
    this.processes.set(id, child);

    // Handle unexpected exit
    child.on("exit", () => {
      this.forks.delete(id);
      this.processes.delete(id);
    });

    return fork;
  }

  getFork(id: string): Fork | undefined {
    return this.forks.get(id);
  }

  listForks(): Fork[] {
    return Array.from(this.forks.values());
  }

  destroyFork(id: string): boolean {
    const child = this.processes.get(id);
    if (!child) return false;

    child.kill("SIGTERM");
    this.forks.delete(id);
    this.processes.delete(id);
    return true;
  }

  // -----------------------------------------------------------------------
  // Fork operations
  // -----------------------------------------------------------------------

  async snapshot(id: string): Promise<string> {
    const fork = this.requireFork(id);
    const snapshotId = (await sendRpc(fork.port, "evm_snapshot")) as string;
    return snapshotId;
  }

  async revert(id: string, snapshotId: string): Promise<boolean> {
    const fork = this.requireFork(id);
    const success = (await sendRpc(fork.port, "evm_revert", [
      snapshotId,
    ])) as boolean;
    return success;
  }

  async fund(id: string, address: string, amountWei: string): Promise<void> {
    const fork = this.requireFork(id);
    await sendRpc(fork.port, "anvil_setBalance", [address, amountWei]);
  }

  async setStorage(
    id: string,
    address: string,
    slot: string,
    value: string,
  ): Promise<void> {
    const fork = this.requireFork(id);
    await sendRpc(fork.port, "anvil_setStorageAt", [address, slot, value]);
  }

  async mineBlocks(id: string, count: number): Promise<void> {
    const fork = this.requireFork(id);
    // anvil supports mining multiple blocks at once via evm_mine with a parameter
    for (let i = 0; i < count; i++) {
      await sendRpc(fork.port, "evm_mine");
    }
  }

  async timeTravel(id: string, seconds: number): Promise<void> {
    const fork = this.requireFork(id);
    await sendRpc(fork.port, "evm_increaseTime", [seconds]);
    await sendRpc(fork.port, "evm_mine");
  }

  async getBlockNumber(id: string): Promise<number> {
    const fork = this.requireFork(id);
    const hex = (await sendRpc(fork.port, "eth_blockNumber")) as string;
    return parseInt(hex, 16);
  }

  /** Proxy an arbitrary JSON-RPC request to a fork. */
  async proxyRpc(
    id: string,
    method: string,
    params: unknown[] = [],
  ): Promise<unknown> {
    const fork = this.requireFork(id);
    return sendRpc(fork.port, method, params);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private requireFork(id: string): Fork {
    const fork = this.forks.get(id);
    if (!fork) throw new Error(`Fork not found: ${id}`);
    return fork;
  }

  private async findAvailablePort(): Promise<number> {
    // Collect all ports currently in use by our forks
    const usedPorts = new Set(
      Array.from(this.forks.values()).map((f) => f.port),
    );

    let port = this.nextPort;
    const maxAttempts = 100;

    for (let i = 0; i < maxAttempts; i++) {
      if (!usedPorts.has(port) && !(await isPortListening(port))) {
        this.nextPort = port + 1;
        return port;
      }
      port++;
    }

    throw new Error("Unable to find an available port for anvil");
  }

  private startAutoCleanup(): void {
    // Check every 5 minutes for expired forks
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, fork] of this.forks) {
        if (now - fork.createdAt.getTime() > this.ttlMs) {
          console.log(
            `[forkManager] Auto-destroying expired fork: ${fork.label} (${id})`,
          );
          this.destroyFork(id);
        }
      }
    }, 5 * 60 * 1000);
  }

  private registerExitHandlers(): void {
    const cleanup = () => {
      console.log("[forkManager] Cleaning up all anvil processes...");
      for (const [id] of this.processes) {
        this.destroyFork(id);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const forkManager = new ForkManager();
