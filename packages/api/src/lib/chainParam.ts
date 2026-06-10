import { z } from "zod";
import { ApiError } from "./respond.js";
import {
  DEFAULT_CHAIN_ID,
  isSupportedChain,
} from "../services/chains/registry.js";

/**
 * Shared `chainid` resolution for the REST routes (alerts, simulate, fork,
 * testnets). Same coercion contract as the Etherscan dispatcher's
 * `resolveChain` (routes/etherscan/chain.ts) and the portfolio route, but
 * raising `ApiError` so `respond.fail` emits the standard REST envelope:
 *
 *   - omitted / empty                  → DEFAULT_CHAIN_ID (369, PulseChain)
 *   - present + supported              → that chain id
 *   - present + malformed/unsupported  → 400 ApiError
 *
 * Strictness note: the `chainContext` middleware is deliberately
 * NON-rejecting (bad chainid → default chain) to preserve legacy behavior on
 * routes that don't validate. Routes that opt in via this helper get the
 * strict behavior — a typo'd `chainid` is a 400, never a silent fall-through
 * to PulseChain data.
 */

/** Reusable schema fragment for a `chainid` body/query field. */
export const chainIdParamSchema = z.coerce
  .number()
  .int()
  .positive()
  .optional();

/**
 * Resolve a raw `chainid` value (query string, body field, or already-parsed
 * number) to a supported chain id, defaulting to `DEFAULT_CHAIN_ID` when
 * omitted. Throws `ApiError(400)` on malformed or unsupported input.
 */
export function resolveChainIdParam(raw: unknown): number {
  // A bare `chainid=` query key arrives as "" — treat it as omitted rather
  // than letting z.coerce turn it into 0 and fail `.positive()`.
  const value = raw === "" || raw === null ? undefined : raw;
  const parsed = chainIdParamSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "Invalid chainid — must be a positive integer");
  }
  const chainId = parsed.data ?? DEFAULT_CHAIN_ID;
  if (!isSupportedChain(chainId)) {
    throw new ApiError(400, `Unsupported chainId: ${chainId}`);
  }
  return chainId;
}
