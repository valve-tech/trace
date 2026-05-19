// ============================================================================
// SECURITY WARNING — node:vm is NOT a security boundary
// ============================================================================
// Per the official Node.js docs (https://nodejs.org/api/vm.html#vm-executing-
// javascript), `vm.createContext` and friends provide ISOLATION, NOT SECURITY.
// Sandboxed code can reach host-realm objects via prototype/constructor chains
// on any passed-in value. The classic escape:
//
//   Buffer.constructor("return process")()   // → host process global
//
// works because `Buffer` (and every other host-realm constructor we expose
// below) carries a `.constructor` that points back at the host's `Function`.
// From there, `process.binding`, `require("child_process")`, filesystem
// access, etc. are all reachable. The 30-second timeout on `runInContext`
// does NOT stop synchronous escape attempts that finish in microseconds.
//
// This executor is acceptable for SOLO LOCAL DEVELOPMENT only. Multi-tenant
// deployments must replace it with a true isolation primitive — `isolated-vm`
// (native v8 isolate), a `--permission`-locked worker, or `quickjs-emscripten`.
//
// Tracked in progress.txt outstanding work. Until that migration ships, a
// loud startup warning is emitted from `warnUnsafeExecutorOnce()` below.
// ============================================================================

import vm from "node:vm";
import { publicClient } from "./rpc.js";
import {
  type ActionRow,
  getActionStorage,
  setActionStorage,
  addLog,
} from "./actionsDb.js";
import { type Address, type Hex, formatEther } from "viem";

let unsafeWarningEmitted = false;
function warnUnsafeExecutorOnce(): void {
  if (unsafeWarningEmitted) return;
  unsafeWarningEmitted = true;
  console.warn(
    "\n[actionExecutor] ⚠  Running user code in node:vm — NOT a security " +
      "boundary. Sandboxed code can escape to the host realm via " +
      "`SomeHostObject.constructor(...)`. Suitable for local dev only. " +
      "See progress.txt for the isolated-vm migration plan.\n",
  );
}

// ---------------------------------------------------------------------------
// Types
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
// RPC helpers exposed to user code
// ---------------------------------------------------------------------------
function createRpcHelpers() {
  return {
    async call(to: string, data: string): Promise<string> {
      const result = await publicClient.call({
        to: to as Address,
        data: data as Hex,
      });
      return result.data ?? "0x";
    },

    async getBalance(address: string): Promise<string> {
      const balance = await publicClient.getBalance({
        address: address as Address,
      });
      return formatEther(balance);
    },

    async getBlock(number?: number): Promise<unknown> {
      const block = await publicClient.getBlock(
        number !== undefined ? { blockNumber: BigInt(number) } : {},
      );
      return {
        number: Number(block.number),
        hash: block.hash,
        timestamp: Number(block.timestamp),
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString(),
        baseFeePerGas: block.baseFeePerGas?.toString(),
        transactionCount: block.transactions.length,
      };
    },

    async getTransaction(hash: string): Promise<unknown> {
      const tx = await publicClient.getTransaction({
        hash: hash as Hex,
      });
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: formatEther(tx.value),
        nonce: tx.nonce,
        gas: tx.gas.toString(),
        blockNumber: tx.blockNumber ? Number(tx.blockNumber) : null,
        input: tx.input,
      };
    },

    async getTransactionReceipt(hash: string): Promise<unknown> {
      const receipt = await publicClient.getTransactionReceipt({
        hash: hash as Hex,
      });
      return {
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: Number(receipt.blockNumber),
        logs: receipt.logs.map((l) => ({
          address: l.address,
          topics: l.topics,
          data: l.data,
        })),
      };
    },

    async getLogs(params: {
      address?: string;
      fromBlock?: number;
      toBlock?: number;
    }): Promise<unknown[]> {
      const logs = await publicClient.getLogs({
        address: params.address as Address | undefined,
        fromBlock: params.fromBlock !== undefined ? BigInt(params.fromBlock) : undefined,
        toBlock: params.toBlock !== undefined ? BigInt(params.toBlock) : undefined,
      });
      return logs.map((l) => ({
        address: l.address,
        topics: [...l.topics],
        data: l.data,
        blockNumber: l.blockNumber ? Number(l.blockNumber) : null,
        transactionHash: l.transactionHash,
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Execute an action
// secrets and storage are now JSONB objects from pg — no JSON.parse needed
// ---------------------------------------------------------------------------
export async function executeAction(
  action: ActionRow,
  triggerEvent: TriggerEvent,
): Promise<ExecutionResult> {
  warnUnsafeExecutorOnce();
  const startTime = Date.now();
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const secrets = (action.secrets ?? {}) as Record<string, string>;

  const storageData = await getActionStorage(action.id);
  const storageProxy = {
    get(key: string): unknown {
      return storageData[key];
    },
    set(key: string, value: unknown): void {
      storageData[key] = value;
    },
    getAll(): Record<string, unknown> {
      return { ...storageData };
    },
    delete(key: string): void {
      delete storageData[key];
    },
  };

  const capturedConsole = {
    log: (...args: unknown[]) => {
      stdoutLines.push(args.map(String).join(" "));
    },
    warn: (...args: unknown[]) => {
      stderrLines.push(`[warn] ${args.map(String).join(" ")}`);
    },
    error: (...args: unknown[]) => {
      stderrLines.push(`[error] ${args.map(String).join(" ")}`);
    },
    info: (...args: unknown[]) => {
      stdoutLines.push(`[info] ${args.map(String).join(" ")}`);
    },
  };

  const sandbox = {
    console: capturedConsole,
    event: triggerEvent,
    rpc: createRpcHelpers(),
    secrets,
    storage: storageProxy,
    fetch: globalThis.fetch,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    Buffer: Buffer,
    JSON: JSON,
    Math: Math,
    Date: Date,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Map: Map,
    Set: Set,
    Promise: Promise,
    Error: Error,
    RegExp: RegExp,
    URL: URL,
    URLSearchParams: URLSearchParams,
  };

  const context = vm.createContext(sandbox);

  const wrappedCode = `
(async () => {
  ${action.code}

  if (typeof handler === 'function') {
    await handler({ event, rpc, secrets, storage });
  }
})()
`;

  try {
    const script = new vm.Script(wrappedCode, {
      filename: `action-${action.id}.js`,
    });

    const resultPromise = script.runInContext(context, {
      timeout: 30_000,
      breakOnSigint: true,
    });

    if (resultPromise && typeof resultPromise.then === "function") {
      await Promise.race([
        resultPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Action execution timed out (30s)")), 30_000),
        ),
      ]);
    }

    await setActionStorage(action.id, storageData);

    const duration = Date.now() - startTime;
    const result: ExecutionResult = {
      success: true,
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
      duration_ms: duration,
    };

    await addLog({
      action_id: action.id,
      duration_ms: duration,
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return result;
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    stderrLines.push(`[fatal] ${errorMessage}`);

    const result: ExecutionResult = {
      success: false,
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
      duration_ms: duration,
      error: errorMessage,
    };

    await addLog({
      action_id: action.id,
      duration_ms: duration,
      success: false,
      stdout: result.stdout,
      stderr: result.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return result;
  }
}
