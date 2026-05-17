import type { Hex } from "viem";
import type { RawCallFrame, TraceResult } from "../types.js";
import { loadTraceFromObject } from "./loadTraceFromObject.js";

export interface LoadHashOptions {
  /** Transaction hash to trace. */
  txHash: Hex;
  /** RPC endpoint (must support `debug_traceTransaction`). */
  rpcUrl: string;
  /** Optional fetch implementation — defaults to the global. */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in ms (default 60_000). */
  timeoutMs?: number;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Fetch a trace via `debug_traceTransaction` (callTracer mode) and normalize
 * it. The caller must point at an RPC endpoint that supports debug methods —
 * public PulseChain RPC does not, but Anvil forks and dedicated nodes do.
 *
 * Throws on RPC error, network failure, or timeout. Does NOT throw for empty
 * traces; an empty top-level frame becomes a TraceFrame with no children.
 */
export async function loadTraceFromHash(
  options: LoadHashOptions,
): Promise<TraceResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "loadTraceFromHash: no fetch implementation available (pass `fetch` in options)",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 60_000,
  );

  try {
    const res = await fetchImpl(options.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "debug_traceTransaction",
        params: [options.txHash, { tracer: "callTracer" }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `loadTraceFromHash: RPC HTTP ${res.status} ${res.statusText}`,
      );
    }

    const body = (await res.json()) as JsonRpcResponse<RawCallFrame>;

    if (body.error) {
      throw new Error(
        `loadTraceFromHash: RPC error ${body.error.code} ${body.error.message}`,
      );
    }

    if (!body.result) {
      throw new Error("loadTraceFromHash: RPC returned no result");
    }

    return loadTraceFromObject({
      callFrame: body.result,
      txHash: options.txHash,
    });
  } finally {
    clearTimeout(timer);
  }
}
