/**
 * Execution trace service.
 *
 * Uses debug_traceTransaction (requires a debug-enabled node).
 * Falls back to Anvil fork when debug API is unavailable.
 * Caches results in PostgreSQL (mined tx traces are immutable).
 */

import { pool } from "./pool.js";

// ---------------------------------------------------------------------------
// Trace cache — mined transactions produce identical traces every time
// ---------------------------------------------------------------------------

async function getCachedTrace<T>(txHash: string, traceType: string): Promise<T | null> {
  try {
    const { rows } = await pool.query<{ result: T }>(
      "SELECT result FROM trace_cache WHERE tx_hash = $1 AND trace_type = $2",
      [txHash.toLowerCase(), traceType],
    );
    return rows[0]?.result ?? null;
  } catch {
    return null;
  }
}

async function setCachedTrace(txHash: string, traceType: string, result: unknown): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO trace_cache (tx_hash, trace_type, result)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (tx_hash, trace_type) DO UPDATE SET result = $3::jsonb, created_at = NOW()`,
      [txHash.toLowerCase(), traceType, JSON.stringify(result)],
    );
  } catch (err) {
    console.error("[tracer] cache write failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallFrame {
  type: string;
  from: string;
  to: string;
  value?: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  error?: string;
  calls?: CallFrame[];
}

export interface CallTraceResult {
  trace: CallFrame | null;
  error: string | null;
  debugAvailable: boolean;
}

export interface OpcodeStep {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  stack: string[];
  memory: string[];
  storage: Record<string, string>;
}

export interface OpcodeTraceResult {
  steps: OpcodeStep[];
  gas: number;
  returnValue: string;
  error: string | null;
  debugAvailable: boolean;
}

export interface TraceCallParams {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
}

// ---------------------------------------------------------------------------
// RPC URL for debug calls
// ---------------------------------------------------------------------------

const DEBUG_RPC_URL =
  process.env.DEBUG_RPC_URL ||
  process.env.PULSECHAIN_RPC_URL ||
  "https://rpc.pulsechain.com";

// ---------------------------------------------------------------------------
// Raw JSON-RPC helper
// ---------------------------------------------------------------------------

async function makeDebugRpc(
  method: string,
  params: unknown[],
): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  };

  const res = await fetch(DEBUG_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`RPC HTTP error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if an RPC error indicates the debug API is unavailable (method not
 * found, not supported, etc.).
 */
function isDebugUnavailable(err: { code: number; message: string }): boolean {
  const msg = err.message.toLowerCase();
  return (
    err.code === -32601 || // Method not found
    err.code === -32600 || // Invalid request (some nodes)
    msg.includes("method not found") ||
    msg.includes("not available") ||
    msg.includes("not supported") ||
    msg.includes("does not exist") ||
    msg.includes("debug_") ||
    msg.includes("method debug")
  );
}

const UNAVAILABLE_MSG =
  "The debug API is not available on the connected RPC node. " +
  "To use the debugger, configure DEBUG_RPC_URL to point to a node with the debug namespace enabled " +
  "(e.g., Erigon or Geth started with --http.api=debug).";

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_URL || "https://api.scan.pulsechain.com/api";

// ---------------------------------------------------------------------------
// Anvil fork fallback — replay tx on a fork with debug APIs
// ---------------------------------------------------------------------------

import { publicClient } from "./rpc.js";
import { forkManager } from "./forkManager.js";
import type { Hex } from "viem";

async function makeAnvilRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<{ result?: unknown; error?: { code: number; message: string } }> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(120_000),
  });
  return (await res.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };
}

/**
 * Fork the chain at the tx's block and use debug_traceCall to simulate the
 * exact call. This avoids nonce/gas issues from replaying via eth_sendTransaction.
 * Anvil natively supports both debug_traceCall and debug_traceTransaction.
 */
async function traceViaAnvilFork(
  hash: string,
  tracerConfig: unknown,
): Promise<{ result: unknown; rpcUrl: string; forkId: string } | null> {
  try {
    const tx = await publicClient.getTransaction({ hash: hash as Hex });
    if (!tx || !tx.blockNumber) return null;

    // Fork at the tx's block (not block-1) so we can use debug_traceCall
    // with the exact state the tx executed against
    const forkBlock = Number(tx.blockNumber);
    const fork = await forkManager.createFork({
      blockNumber: forkBlock,
      label: `trace-${hash.slice(0, 10)}`,
    });

    try {
      // Use debug_traceCall — simulates the call without needing to send a tx
      const callParams: Record<string, string> = {
        from: tx.from,
        to: tx.to ?? "",
        data: tx.input,
        gas: "0x" + tx.gas.toString(16),
      };
      if (tx.value > 0n) {
        callParams.value = "0x" + tx.value.toString(16);
      }

      const traceResult = await makeAnvilRpc(
        fork.rpcUrl,
        "debug_traceCall",
        [callParams, "latest", tracerConfig],
      );

      if (traceResult.error) {
        forkManager.destroyFork(fork.id);
        return null;
      }

      // Schedule fork cleanup
      setTimeout(() => {
        forkManager.destroyFork(fork.id);
      }, 120_000);

      return { result: traceResult.result, rpcUrl: fork.rpcUrl, forkId: fork.id };
    } catch {
      forkManager.destroyFork(fork.id);
      return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// BlockScout fallback — build call tree from internal transactions
// ---------------------------------------------------------------------------

interface BlockScoutInternalTx {
  from: string;
  to: string;
  value: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  type: string;
  callType?: string;
  index?: string | number;
  errCode?: string;
  contractAddress?: string;
  isError?: string;
}

/**
 * Fetch internal transactions from BlockScout and reconstruct a call tree.
 * This works without debug_ API access.
 *
 * Strategy: BlockScout returns internal txs ordered by execution index.
 * We use a stack-based approach — when `itx.from` matches the `to` of a
 * node on the stack and the gas is within that node's remaining gas budget,
 * the itx is a child. Otherwise we pop up until we find the right parent.
 */
async function traceViaBlockScout(hash: string): Promise<CallTraceResult> {
  try {
    const url = `${BLOCKSCOUT_API}?module=account&action=txlistinternal&txhash=${hash}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { trace: null, error: `BlockScout HTTP ${res.status}`, debugAvailable: false };
    }

    const json = (await res.json()) as { status: string; result: BlockScoutInternalTx[] | string };
    if (json.status !== "1" || !Array.isArray(json.result) || json.result.length === 0) {
      return { trace: null, error: "No internal transactions found via BlockScout", debugAvailable: false };
    }

    const itxs = json.result;

    // Also fetch the parent transaction for the root frame
    const txUrl = `${BLOCKSCOUT_API}?module=transaction&action=gettxinfo&txhash=${hash}`;
    const txRes = await fetch(txUrl, { signal: AbortSignal.timeout(10_000) });
    let rootFrom = "", rootTo = "", rootValue = "0", rootGas = "0", rootGasUsed = "0", rootInput = "0x";
    if (txRes.ok) {
      const txJson = (await txRes.json()) as { status: string; result: Record<string, string> };
      if (txJson.status === "1" && txJson.result) {
        rootFrom = txJson.result.from ?? "";
        rootTo = txJson.result.to ?? "";
        rootValue = txJson.result.value ?? "0";
        rootGas = txJson.result.gas ?? "0";
        rootGasUsed = txJson.result.gasUsed ?? "0";
        rootInput = txJson.result.input ?? "0x";
      }
    }

    const root: CallFrame = {
      type: "CALL",
      from: rootFrom,
      to: rootTo,
      value: rootValue,
      gas: rootGas,
      gasUsed: rootGasUsed,
      input: rootInput,
      calls: [],
    };

    // Sort by index to guarantee execution order
    const sorted = [...itxs].sort((a, b) => {
      const ai = Number(a.index ?? 0);
      const bi = Number(b.index ?? 0);
      return ai - bi;
    });

    // Stack-based tree construction.
    // Each stack entry is a CallFrame. A new itx is a child of the deepest
    // stack entry whose `to` (or `from` for delegatecall) matches `itx.from`
    // and whose gas >= itx.gas (since a child can't have more gas than parent gave it).
    const stack: CallFrame[] = [root];

    for (const itx of sorted) {
      const frame: CallFrame = {
        type: (itx.callType || itx.type || "CALL").toUpperCase(),
        from: itx.from || "",
        to: itx.to || itx.contractAddress || "",
        value: itx.value || "0",
        gas: itx.gas || "0",
        gasUsed: itx.gasUsed || "0",
        input: itx.input || "0x",
        error: itx.errCode || (itx.isError === "1" ? "reverted" : undefined),
        calls: [],
      };

      const itxFrom = frame.from.toLowerCase();
      const itxGas = parseInt(frame.gas) || 0;

      // Pop stack until we find a valid parent:
      // The parent is the deepest node where (parent.to == itx.from) or
      // (parent.from == itx.from for delegatecall) and parent.gas >= itx.gas
      while (stack.length > 1) {
        const top = stack[stack.length - 1]!;
        const topTo = top.to.toLowerCase();
        const topFrom = top.from.toLowerCase();
        const topGas = parseInt(top.gas) || 0;
        const isDelegateCall = top.type === "DELEGATECALL";

        const callerMatch = isDelegateCall
          ? topFrom === itxFrom
          : topTo === itxFrom;

        if (callerMatch && topGas >= itxGas) {
          break;
        }
        stack.pop();
      }

      const parent = stack[stack.length - 1]!;
      if (!parent.calls) parent.calls = [];
      parent.calls.push(frame);
      stack.push(frame);
    }

    return { trace: root, error: null, debugAvailable: false };
  } catch (err) {
    return {
      trace: null,
      error: `BlockScout fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      debugAvailable: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trace a transaction using the `callTracer` — returns a call tree.
 * Falls back to BlockScout internal transactions if debug API is unavailable.
 */
export async function traceTransaction(
  hash: string,
): Promise<CallTraceResult> {
  // Check cache first — mined tx traces are immutable
  const cached = await getCachedTrace<CallFrame>(hash, "calltree");
  if (cached) {
    return { trace: cached, error: null, debugAvailable: true };
  }

  try {
    const rpcResult = await makeDebugRpc("debug_traceTransaction", [
      hash,
      { tracer: "callTracer", tracerConfig: { withLog: false } },
    ]);

    if (rpcResult.error) {
      if (isDebugUnavailable(rpcResult.error)) {
        // Try Anvil fork before falling back to BlockScout
        console.log(`[tracer] debug RPC unavailable, trying Anvil fork for ${hash}`);
        const anvilResult = await traceViaAnvilFork(hash, {
          tracer: "callTracer",
          tracerConfig: { withLog: false },
        });
        if (anvilResult) {
          const trace = anvilResult.result as CallFrame;
          void setCachedTrace(hash, "calltree", trace);
          return { trace, error: null, debugAvailable: true };
        }
        return traceViaBlockScout(hash);
      }
      return {
        trace: null,
        error: `RPC error: ${rpcResult.error.message}`,
        debugAvailable: true,
      };
    }

    const trace = rpcResult.result as CallFrame;
    void setCachedTrace(hash, "calltree", trace);
    return { trace, error: null, debugAvailable: true };
  } catch {
    const anvilResult = await traceViaAnvilFork(hash, {
      tracer: "callTracer",
      tracerConfig: { withLog: false },
    });
    if (anvilResult) {
      const trace = anvilResult.result as CallFrame;
      void setCachedTrace(hash, "calltree", trace);
      return { trace, error: null, debugAvailable: true };
    }
    return traceViaBlockScout(hash);
  }
}

/**
 * Trace a transaction at the opcode level using the default struct logger.
 */
export async function traceTransactionOpcodes(
  hash: string,
  limit: number = 10000,
): Promise<OpcodeTraceResult> {
  // Check cache — use a limit-specific key since different limits produce different results
  const cacheKey = `opcodes_${limit}`;
  const cached = await getCachedTrace<OpcodeTraceResult>(hash, cacheKey);
  if (cached) {
    return { ...cached, debugAvailable: true };
  }

  const structLogConfig = {
    disableStorage: false,
    disableMemory: false,
    disableStack: false,
    limit,
  };

  const parseStructLogs = (raw: {
    structLogs?: Array<{
      pc: number;
      op: string;
      gas: number;
      gasCost: number;
      depth: number;
      stack?: string[];
      memory?: string[];
      storage?: Record<string, string>;
    }>;
    gas?: number;
    returnValue?: string;
  }): OpcodeTraceResult => {
    const steps: OpcodeStep[] = (raw.structLogs ?? [])
      .slice(0, limit)
      .map((s) => ({
        pc: s.pc,
        op: s.op,
        gas: s.gas,
        gasCost: s.gasCost,
        depth: s.depth,
        stack: s.stack ?? [],
        memory: s.memory ?? [],
        storage: s.storage ?? {},
      }));

    return {
      steps,
      gas: raw.gas ?? 0,
      returnValue: raw.returnValue ?? "",
      error: null,
      debugAvailable: true,
    };
  };

  try {
    const rpcResult = await makeDebugRpc("debug_traceTransaction", [
      hash,
      structLogConfig,
    ]);

    if (rpcResult.error) {
      if (isDebugUnavailable(rpcResult.error)) {
        // Try Anvil fork fallback
        console.log(`[tracer] debug RPC unavailable for opcodes, trying Anvil fork for ${hash}`);
        const anvilResult = await traceViaAnvilFork(hash, structLogConfig);
        if (anvilResult) {
          const result = parseStructLogs(anvilResult.result as Parameters<typeof parseStructLogs>[0]);
          void setCachedTrace(hash, cacheKey, result);
          return result;
        }
        return {
          steps: [],
          gas: 0,
          returnValue: "",
          error: UNAVAILABLE_MSG,
          debugAvailable: false,
        };
      }
      return {
        steps: [],
        gas: 0,
        returnValue: "",
        error: `RPC error: ${rpcResult.error.message}`,
        debugAvailable: true,
      };
    }

    const result = parseStructLogs(rpcResult.result as Parameters<typeof parseStructLogs>[0]);
    void setCachedTrace(hash, cacheKey, result);
    return result;
  } catch {
    const anvilResult = await traceViaAnvilFork(hash, structLogConfig);
    if (anvilResult) {
      const result = parseStructLogs(anvilResult.result as Parameters<typeof parseStructLogs>[0]);
      void setCachedTrace(hash, cacheKey, result);
      return result;
    }
    return {
      steps: [],
      gas: 0,
      returnValue: "",
      error: "Failed to trace opcodes. Anvil (Foundry) may not be installed.",
      debugAvailable: false,
    };
  }
}

/**
 * Trace a simulated call (not yet on-chain) using debug_traceCall.
 */
export async function traceCall(
  params: TraceCallParams,
): Promise<CallTraceResult> {
  try {
    const txObj: Record<string, string> = {};
    if (params.from) txObj.from = params.from;
    if (params.to) txObj.to = params.to;
    if (params.value) txObj.value = params.value;
    if (params.data) txObj.data = params.data;
    if (params.gas) txObj.gas = params.gas;

    const rpcResult = await makeDebugRpc("debug_traceCall", [
      txObj,
      "latest",
      { tracer: "callTracer", tracerConfig: { withLog: false } },
    ]);

    if (rpcResult.error) {
      if (isDebugUnavailable(rpcResult.error)) {
        return { trace: null, error: UNAVAILABLE_MSG, debugAvailable: false };
      }
      return {
        trace: null,
        error: `RPC error: ${rpcResult.error.message}`,
        debugAvailable: true,
      };
    }

    const trace = rpcResult.result as CallFrame;
    return { trace, error: null, debugAvailable: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      trace: null,
      error: `Failed to trace call: ${message}`,
      debugAvailable: false,
    };
  }
}
