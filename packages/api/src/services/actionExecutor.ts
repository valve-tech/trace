import vm from "node:vm";
import { publicClient } from "./rpc.js";
import {
  type ActionRow,
  getActionStorage,
  setActionStorage,
  addLog,
} from "./actionsDb.js";
import { type Address, type Hex, formatEther, formatUnits } from "viem";

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
// ---------------------------------------------------------------------------
export async function executeAction(
  action: ActionRow,
  triggerEvent: TriggerEvent,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  // Parse secrets
  let secrets: Record<string, string> = {};
  try {
    secrets = JSON.parse(action.secrets) as Record<string, string>;
  } catch {
    // ignore parse errors
  }

  // Build storage helpers
  const storageData = getActionStorage(action.id);
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

  // Build console capture
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

  // Build sandbox context
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

  // Wrap user code: support both `export async function handler` and direct code
  // We wrap the code so that if they write handler(), we call it.
  const wrappedCode = `
(async () => {
  ${action.code}

  // If a handler function was defined, call it
  if (typeof handler === 'function') {
    await handler({ event, rpc, secrets, storage });
  }
})()
`;

  try {
    const script = new vm.Script(wrappedCode, {
      filename: `action-${action.id}.js`,
    });

    // Run with 30s timeout
    const resultPromise = script.runInContext(context, {
      timeout: 30_000,
      breakOnSigint: true,
    });

    // If the result is a promise (async code), await it with a timeout
    if (resultPromise && typeof resultPromise.then === "function") {
      await Promise.race([
        resultPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Action execution timed out (30s)")), 30_000),
        ),
      ]);
    }

    // Persist storage changes
    setActionStorage(action.id, storageData);

    const duration = Date.now() - startTime;
    const result: ExecutionResult = {
      success: true,
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
      duration_ms: duration,
    };

    // Log execution
    addLog({
      action_id: action.id,
      duration_ms: duration,
      success: 1,
      stdout: result.stdout,
      stderr: result.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return result;
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Append error to stderr
    stderrLines.push(`[fatal] ${errorMessage}`);

    const result: ExecutionResult = {
      success: false,
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
      duration_ms: duration,
      error: errorMessage,
    };

    // Log execution
    addLog({
      action_id: action.id,
      duration_ms: duration,
      success: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      trigger_data: JSON.stringify(triggerEvent),
    });

    return result;
  }
}
