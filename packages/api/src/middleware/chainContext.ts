import type { Request, Response, NextFunction } from "express";
import {
  DEFAULT_CHAIN_ID,
  isSupportedChain,
} from "../services/chains/registry.js";
import { runWithChain } from "../services/chains/context.js";

/**
 * Resolve the request's target chain from `?chainid` (query) or a `chainid`
 * body field, then run the rest of the request inside the chain context so
 * deep service code routes to the right per-chain valve RPC endpoint.
 *
 * Resolution is intentionally NON-rejecting:
 *   - omitted / empty                 → DEFAULT_CHAIN_ID (369)
 *   - present + supported             → that chain
 *   - present + malformed/unsupported → DEFAULT_CHAIN_ID (369)
 *
 * The fall-through-to-default on bad input preserves the legacy behavior (the
 * REST surface previously ignored `chainid` entirely → 369) and, crucially,
 * leaves the Etherscan dispatcher's own strict `resolveChain` validation
 * untouched — the dispatcher still returns its Etherscan error envelope for a
 * bad `chainid`, rather than this middleware short-circuiting with a different
 * shape. Mounted ahead of `/rpc` and `/api`.
 */
export function chainContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const fromQuery =
    typeof req.query.chainid === "string" && req.query.chainid !== ""
      ? req.query.chainid
      : undefined;
  const fromBody =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>).chainid
      : undefined;
  const raw = fromQuery ?? fromBody;

  let chainId = DEFAULT_CHAIN_ID;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && isSupportedChain(n)) {
      chainId = n;
    }
  }

  runWithChain(chainId, () => next());
}
