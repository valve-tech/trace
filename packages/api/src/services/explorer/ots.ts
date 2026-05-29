/**
 * Otterscan (`ots_*`) JSON-RPC helpers.
 *
 * Why a separate module:
 * - viem doesn't type the `ots_*` namespace, so calls go through the raw
 *   `request` transport with a runtime type assertion.
 * - Not every node enables it (`--http.api=ots` is required on Reth). We
 *   probe once per cold start, cache the verdict, and let callers branch.
 * - Reth's `search_transactions_before/after` are stubbed `unimplemented!`
 *   in current source — even when the namespace is on, those two methods
 *   return an error. We don't depend on them anywhere; this comment exists
 *   so future readers don't try.
 */

import { publicClient } from "../rpc.js";

type JsonRpcMethodMissing = { code: number; message?: string };

let supportCache: boolean | null = null;

/**
 * Detect "this RPC doesn't expose the ots_ namespace". Same shape of error
 * codes/messages used by `services/tracer/debugRpc.ts:isDebugUnavailable`.
 */
function isOtsUnavailable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as JsonRpcMethodMissing;
  const code = typeof e.code === "number" ? e.code : 0;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    code === -32601 ||
    msg.includes("method not found") ||
    msg.includes("does not exist") ||
    msg.includes("not supported")
  );
}

/**
 * Make an `ots_*` RPC call. Returns `null` (no throw) if the namespace
 * isn't enabled — callers branch to a non-ots fallback. Re-throws every
 * other error.
 */
export async function otsCall<T>(method: string, params: unknown[]): Promise<T | null> {
  if (supportCache === false) return null;
  try {
    // viem's request() is generic over its own EIP-1474 union; we're stepping
    // outside that union deliberately to call namespaced methods.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (publicClient.request as any)({ method, params });
    if (supportCache === null) supportCache = true;
    return result as T;
  } catch (err) {
    if (isOtsUnavailable(err)) {
      supportCache = false;
      return null;
    }
    throw err;
  }
}

/**
 * Test-only hook to reset the support cache between unit tests.
 * Not exported via the package barrel.
 */
export function __resetOtsSupportCache(): void {
  supportCache = null;
}

// ---------------------------------------------------------------------------
// Typed wrappers for the methods we actually use
// ---------------------------------------------------------------------------

/**
 * Shape of `ots_getBlockDetails` / `ots_getBlockDetailsByHash`. Mirrors
 * Reth's `BlockDetails` (crates/rpc/rpc-types/src/otterscan.rs): the block
 * sits under `block`, `transactions` is omitted entirely, `transactionCount`
 * carries the count, `issuance` and `totalFees` are appended.
 *
 * Only the fields we read are typed — the rest is permissive.
 */
export interface OtsBlockDetails {
  block: {
    number: `0x${string}`;
    hash: `0x${string}`;
    parentHash: `0x${string}`;
    timestamp: `0x${string}`;
    miner: `0x${string}`;
    gasUsed: `0x${string}`;
    gasLimit: `0x${string}`;
    baseFeePerGas: `0x${string}` | null;
    size: `0x${string}`;
  };
  /** Per Reth's `BlockDetails` wire format, this is hex-encoded like every
   *  other uint on the JSON-RPC surface. Don't try `Number(value)` directly —
   *  it'd return NaN for `0x…`. */
  transactionCount: `0x${string}`;
  totalFees: `0x${string}`;
  issuance?: {
    blockReward: `0x${string}`;
    uncleReward: `0x${string}`;
    issuance: `0x${string}`;
  };
}

export async function otsGetBlockDetails(
  blockTagOrNumber: "latest" | "finalized" | "safe" | "earliest" | bigint | number,
): Promise<OtsBlockDetails | null> {
  // The Reth implementation takes a numeric block number; some node forks
  // also accept tags. We convert the bigint to hex per JSON-RPC convention.
  const param =
    typeof blockTagOrNumber === "string"
      ? blockTagOrNumber
      : `0x${BigInt(blockTagOrNumber).toString(16)}`;
  return otsCall<OtsBlockDetails>("ots_getBlockDetails", [param]);
}
