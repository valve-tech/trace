/**
 * Per-request chain resolution for the Etherscan-shaped `/api` dispatcher.
 *
 * Etherscan threads the target chain through a `chainid` query/body param
 * (e.g. `/api?chainid=1&module=proxy&action=eth_blockNumber`). This module
 * is the single place that parses that param, validates it against the
 * `ChainConfig` registry, and hands handlers a fully-resolved `ChainConfig`
 * so no handler has to re-implement the parse/default/validate dance.
 *
 * Resolution rules (mirrors `routes/portfolio.ts`):
 *   - omitted / empty                  → DEFAULT_CHAIN_ID (369, PulseChain)
 *   - present + supported              → that chain
 *   - present + malformed / unsupported → an Etherscan error envelope
 *
 * The default path is byte-for-byte the legacy single-chain behavior: a
 * request without `chainid` resolves to PulseChain exactly as before.
 */

import { z } from "zod";
import {
  DEFAULT_CHAIN_ID,
  getChain,
  isSupportedChain,
  type ChainConfig,
} from "../../services/chains/registry.js";
import { etherscanErr, type EtherscanErr } from "./envelope.js";

/**
 * Same coercion contract as the portfolio route: a positive integer, or
 * absent. We keep it permissive (`.optional()`) and apply the default
 * ourselves so "omitted" and "0" are distinguishable.
 */
const chainIdSchema = z.coerce.number().int().positive().optional();

export type ChainResolution =
  | { ok: true; chain: ChainConfig }
  | { ok: false; error: EtherscanErr };

/**
 * Resolve the `ChainConfig` for an incoming Etherscan request from its
 * merged params map. Returns a discriminated result so the dispatcher can
 * forward the Etherscan error envelope verbatim on bad input.
 */
export function resolveChain(params: Record<string, unknown>): ChainResolution {
  // Treat an empty-string `chainid=` (a bare query key) the same as omitted —
  // `z.coerce.number()` would otherwise coerce "" to 0 and fail `.positive()`.
  const raw = params.chainid === "" ? undefined : params.chainid;
  const parsed = chainIdSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: etherscanErr("Invalid chainid — must be a positive integer"),
    };
  }

  const chainId = parsed.data ?? DEFAULT_CHAIN_ID;
  if (!isSupportedChain(chainId)) {
    return {
      ok: false,
      error: etherscanErr(`Unsupported chainId: ${chainId}`),
    };
  }

  return { ok: true, chain: getChain(chainId) };
}

/**
 * The chain a handler falls back to when invoked without an explicit
 * `ChainConfig` (e.g. unit tests that call a handler directly with only a
 * params map). Always the registry default — never a guess.
 */
export function defaultChain(): ChainConfig {
  return getChain(DEFAULT_CHAIN_ID);
}
