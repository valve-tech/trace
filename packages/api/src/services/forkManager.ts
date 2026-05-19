import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import {
  createPublicClient,
  createTestClient,
  http,
  publicActions,
  type Address,
  type Hex,
  type PublicActions,
  type TestClient,
} from "viem";

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

/**
 * A viem TestClient (anvil mode) extended with public actions. Anvil-specific
 * methods (`snapshot`, `revert`, `setBalance`, `setStorageAt`, `mine`,
 * `increaseTime`) come from `testActions`; `getBlockNumber` and arbitrary
 * `request({ method, params })` for proxyRpc come from publicActions / the
 * transport. One client is cached per fork in `ForkManager.clients`.
 */
type ForkClient = TestClient<"anvil"> & PublicActions;

function makeForkClient(port: number): ForkClient {
  return createTestClient({
    mode: "anvil",
    transport: http(`http://127.0.0.1:${port}`),
  }).extend(publicActions);
}

// ---------------------------------------------------------------------------
// Port availability helper
// ---------------------------------------------------------------------------

async function isPortListening(port: number): Promise<boolean> {
  try {
    const probe = createPublicClient({
      transport: http(`http://127.0.0.1:${port}`, {
        timeout: 1000,
        retryCount: 0,
      }),
    });
    await probe.getChainId();
    return true;
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
  private clients = new Map<string, ForkClient>();
  private nextPort = 8545;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private ttlMs: number;
  private exitOnSignal = true;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.startAutoCleanup();
    this.registerExitHandlers();
  }

  /**
   * Tear down every fork synchronously and clear the auto-cleanup timer.
   * Safe to call repeatedly; subsequent calls are no-ops once forks are
   * drained. Returns a promise that resolves once SIGTERM has been issued
   * to each child — actual process exit is best-effort.
   *
   * Intended for use by the API's graceful-shutdown orchestrator; the
   * SIGINT/SIGTERM handlers registered in the constructor also call this.
   */
  cleanupAll(): void {
    console.log("[forkManager] Cleaning up all anvil processes...");
    for (const [id] of this.processes) {
      this.destroyFork(id);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * When true (the default), the ForkManager's own SIGINT/SIGTERM handlers
   * call `process.exit(0)` after cleanup. The API's graceful-shutdown
   * orchestrator needs to await cache flushes and the database pool before
   * exiting — call `setExitOnSignal(false)` early in startup so the
   * orchestrator owns the final exit.
   */
  setExitOnSignal(enabled: boolean): void {
    this.exitOnSignal = enabled;
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

    // Build anvil args. Bind to loopback only — exposing forks on 0.0.0.0
    // means anyone on the local network can hit an authoritative-mode RPC
    // capable of impersonation via anvil_setBalance / anvil_setStorageAt /
    // anvil_impersonateAccount. The API process is the only thing that
    // should reach these forks.
    const args: string[] = [
      "--fork-url",
      RPC_URL,
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
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
    this.clients.set(id, makeForkClient(port));

    // Handle unexpected exit
    child.on("exit", () => {
      this.forks.delete(id);
      this.processes.delete(id);
      this.clients.delete(id);
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
    this.clients.delete(id);
    return true;
  }

  // -----------------------------------------------------------------------
  // Fork operations
  // -----------------------------------------------------------------------

  async snapshot(id: string): Promise<Hex> {
    const client = this.requireClient(id);
    return client.snapshot();
  }

  async revert(id: string, snapshotId: string): Promise<boolean> {
    const client = this.requireClient(id);
    await client.revert({ id: snapshotId as Hex });
    // viem's revert resolves on success and throws on RPC failure;
    // anvil's evm_revert returns `true`/`false` but viem doesn't surface
    // the boolean — treat a non-throwing return as success.
    return true;
  }

  async fund(id: string, address: string, amountWei: string): Promise<void> {
    const client = this.requireClient(id);
    await client.setBalance({
      address: address as Address,
      value: BigInt(amountWei),
    });
  }

  async setStorage(
    id: string,
    address: string,
    slot: string,
    value: string,
  ): Promise<void> {
    const client = this.requireClient(id);
    await client.setStorageAt({
      address: address as Address,
      index: slot as Hex,
      value: value as Hex,
    });
  }

  async mineBlocks(id: string, count: number): Promise<void> {
    const client = this.requireClient(id);
    // viem's mine() maps to anvil_mine — one round-trip regardless of count,
    // vs. the previous loop of N evm_mine calls.
    await client.mine({ blocks: count });
  }

  async timeTravel(id: string, seconds: number): Promise<void> {
    const client = this.requireClient(id);
    await client.increaseTime({ seconds });
    await client.mine({ blocks: 1 });
  }

  async getBlockNumber(id: string): Promise<number> {
    const client = this.requireClient(id);
    return Number(await client.getBlockNumber());
  }

  /**
   * Proxy an arbitrary JSON-RPC request to a fork. Uses the viem transport's
   * `request` so untyped/anvil-only methods still flow through the same
   * timeout, retry, and error-parsing pipeline as the typed calls above.
   */
  async proxyRpc(
    id: string,
    method: string,
    params: unknown[] = [],
  ): Promise<unknown> {
    const client = this.requireClient(id);
    return client.request({
      method: method as Parameters<ForkClient["request"]>[0]["method"],
      params: params as Parameters<ForkClient["request"]>[0]["params"],
    });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private requireFork(id: string): Fork {
    const fork = this.forks.get(id);
    if (!fork) throw new Error(`Fork not found: ${id}`);
    return fork;
  }

  private requireClient(id: string): ForkClient {
    const client = this.clients.get(id);
    if (!client) throw new Error(`Fork not found: ${id}`);
    return client;
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
    process.on("exit", () => this.cleanupAll());
    process.on("SIGINT", () => {
      this.cleanupAll();
      if (this.exitOnSignal) process.exit(0);
    });
    process.on("SIGTERM", () => {
      this.cleanupAll();
      if (this.exitOnSignal) process.exit(0);
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const forkManager = new ForkManager();
