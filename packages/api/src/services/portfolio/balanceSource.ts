import type { HeldBalance } from "./transforms.js";

/**
 * The read-time holdings source: current balances per token for a holder, from
 * the `erc20-balance-changes` archive (storage-diff truth) that the monorepo's
 * substreams sink populates into ClickHouse. trace is a *client* here — it
 * queries the final dataset; it does not build, aggregate, or deploy it.
 *
 * THE CONTRACT (per monorepo handoff
 * `docs/superpowers/specs/2026-06-04-erc20-balance-changes-holdings-handoff.md`):
 * the latest storage-diff balance per `(contract, owner)`, positive only —
 *
 *   SELECT contract, argMax(new_balance, (block_num, call_index)) AS bal
 *   FROM balance_changes
 *   WHERE owner = :holder
 *   GROUP BY contract
 *   HAVING bal > 0
 *
 * `contract`/`owner` are bare lowercase hex (no 0x), matching the substreams key
 * form. The result maps 1:1 to `HeldBalance[]` (token = contract, balance = bal).
 *
 * TRANSPORT IS DEFERRED. Two candidate adapters, swappable behind this one
 * function:
 *   - a GraphQL "subset" gateway (Hasura-style) fronting ClickHouse — the
 *     preferred shape (trace never holds DB creds; the gateway enforces the
 *     per-holder filter + limits), but it must be stood up monorepo-side; or
 *   - a direct ClickHouse HTTP read against an exposed, read-scoped endpoint.
 *
 * Until an endpoint exists, this returns `null` ("not indexed for this chain"),
 * so `getHoldings` degrades to native-only and `indexed: false` — the same
 * contract the old Postgres `discoverTokens` used when its table was absent.
 * Wiring the real source is a one-file change here.
 */

/** The canonical archive query, as documentation + the spec for the gateway. */
export const BALANCE_CHANGES_QUERY = `
  SELECT contract, argMax(new_balance, (block_num, call_index)) AS bal
  FROM balance_changes
  WHERE owner = :holder
  GROUP BY contract
  HAVING bal > 0
`.trim();

/**
 * Query held balances for `holderBare` (bare lowercase hex, no 0x) on `chainId`.
 * Returns `null` when no data source is wired for the chain (→ not indexed).
 */
export async function queryBalances(
  _chainId: number,
  _holderBare: string,
): Promise<HeldBalance[] | null> {
  // TODO(transport): wire a GraphQL-gateway or ClickHouse-HTTP adapter once the
  // monorepo exposes a query endpoint for the balance_changes archive. Read the
  // per-chain endpoint from the registry, run BALANCE_CHANGES_QUERY, and map
  // rows → HeldBalance. No endpoint yet → not indexed.
  return null;
}
