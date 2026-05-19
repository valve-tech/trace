import { type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { type Address, type Hex } from "viem";
import { ApiError } from "../lib/respond.js";
import {
  isPortListening,
  makeForkClient,
  type ForkClient,
} from "./forkClient.js";
import { spawnAnvil } from "./spawnAnvil.js";

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
   * drained. SIGTERM is best-effort — children may take a moment to exit.
   *
   * Used by the API's graceful-shutdown orchestrator; SIGINT/SIGTERM
   * handlers registered in the constructor also call this.
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

    const port = await this.findAvailablePort();
    const child = await spawnAnvil({ port, rpcUrl: RPC_URL, blockNumber: options.blockNumber });

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
    return this.requireClient(id).snapshot();
  }

  async revert(id: string, snapshotId: string): Promise<boolean> {
    await this.requireClient(id).revert({ id: snapshotId as Hex });
    // viem's revert resolves on success and throws on RPC failure; treat a
    // non-throwing return as success (anvil's evm_revert returns boolean
    // but viem doesn't surface it).
    return true;
  }

  async fund(id: string, address: string, amountWei: string): Promise<void> {
    await this.requireClient(id).setBalance({
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
    await this.requireClient(id).setStorageAt({
      address: address as Address,
      index: slot as Hex,
      value: value as Hex,
    });
  }

  async mineBlocks(id: string, count: number): Promise<void> {
    // viem's mine() maps to anvil_mine — one round-trip regardless of count,
    // vs. the previous loop of N evm_mine calls.
    await this.requireClient(id).mine({ blocks: count });
  }

  async timeTravel(id: string, seconds: number): Promise<void> {
    const client = this.requireClient(id);
    await client.increaseTime({ seconds });
    await client.mine({ blocks: 1 });
  }

  async getBlockNumber(id: string): Promise<number> {
    return Number(await this.requireClient(id).getBlockNumber());
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

  private requireClient(id: string): ForkClient {
    const client = this.clients.get(id);
    if (!client) throw new ApiError(404, `Fork not found: ${id}`);
    return client;
  }

  private async findAvailablePort(): Promise<number> {
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
