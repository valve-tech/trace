# Session checkpoint — 2026-06-03 PM (holdings: curated store → all-transfers)

Continues the portfolio holdings thread. This session **redesigned the holdings
data model** (curated balance store → all-transfers + `balanceOf`), rewrote the
substreams package and the API consumer, and **verified the whole pipeline
end-to-end on 943** (substreams → sink → 26,742 rows → `getHoldings` with live
`balanceOf`). See the RESOLVED section for how the s2/tier blockers actually
shook out.

## Headline

Holdings moved from a **curated balance store** to **all tokens via a transfers
archive + `balanceOf`**:

- substreams `db_out` is now a **stateless map over every ERC-20 `Transfer`**
  (no curation, no balance store) → append-only `transfers` rows.
- the API **discovers** a wallet's tokens from that archive
  (`DISTINCT token WHERE sender = $holder OR recipient = $holder`) and reads the
  **current** balance + metadata per token in one **multicall**
  (`balanceOf/decimals/symbol/name`).

API unit suite: **433 passing**, `tsc` clean.

## Why this model (the decision path)

1. The curated allowlist only existed to **bound the balance store**; "all
   tokens" makes a global balance store the liability, not an optimization.
2. **Transfers are the superset** — the `(holder → tokens)` membership index is
   a projection of them (`DISTINCT`), so you store transfers and derive
   discovery, not the other way around.
3. **`balanceOf` is the ground truth**, not transfer-sum: summing `Transfer`
   values is *wrong* for rebasing / fee-on-transfer tokens. So transfers answer
   "which tokens," the contract answers "how much."

## Sizing (measured on 369, this session)

- ~**1,000–1,330 Transfer events/block**, ~10.6s blocks, head ≈ 26.7M.
- → ~**10–30 billion** all-time transfer rows, ~**10M/day**.
- **All-transfers archive (369/1): ClickHouse** + dedicated box (~0.3–1 TB).
  Postgres dies at this scale.
- **Membership index** `(holder,token)`: ~15–150M rows, derivable from transfers
  via an **insert-time materialized view** (ClickHouse `ReplacingMergeTree`),
  not a periodic `DISTINCT` scan.
- **943 testnet** (the prototype): MB-scale — local Postgres is fine.

## What changed in `trace` (committed this session)

| File | Change |
|---|---|
| `substreams/src/lib.rs` | stateless all-`Transfer` map; no `CURATED`, no store |
| `substreams/substreams.yaml` | single `db_out` map, genesis start |
| `substreams/schema.sql` | `transfers` archive + sender/recipient/token indexes |
| `packages/api/.../holdings.ts` | `discoverTokens` + multicall `readTokens` (`balanceOf`) |
| `packages/api/.../transforms.ts` | `mapTokenRead` replaces `mapBalanceRow` |
| `packages/api/.../curatedTokens.ts` | demoted to an optional **label override** |
| `packages/api/.../routes/portfolio.ts` | docstring |
| `packages/api/tests/unit/portfolio*.test.ts` | rewritten for the new deps |
| `packages/sdk/{package.json,README.md}` | repo links → public `valve-tech/reth` (monorepo is private) |

## ✅ RESOLVED — full 943 pipeline verified end-to-end

The earlier "s2/Cloudflare edge is broken, not ready" diagnosis was **wrong**.
What actually happened, in order:

1. **`VALVE_KEY`** (in `monorepo/.env`) is the substreams bearer — auth always
   worked.
2. The `Decompressor … "s2"` error was a **client version mismatch**, not the
   edge. Substreams **v1.18.0** switched the default gRPC compression from gzip
   to **s2**; the monorepo's `firehose-meter` (`services/firehose-meter`) only
   registers **gzip**. A freshly-downloaded `substreams`/`substreams-sink-sql`
   (1.18.x / 4.13.x) sends s2 → meter rejects it. Pinning to a **gzip-era**
   build (`substreams` **1.17.11**, `substreams-sink-sql` **v4.12.0**) makes the
   error vanish. The grpcurl/fireeth clients always worked because they don't s2.
3. The remaining 404 was the **substreams tiers being disabled** on the fireeth
   box (the meter is a transparent passthrough to `fireeth :10015`; "fireeth
   itself is unchanged"). Once the tiers were enabled (the monorepo session's
   "separate follow-up"), `sf.substreams.rpc.v2.Stream` served.

**End-to-end proof (this machine, local Postgres):** sink streamed a 200k-block
window through `evm-943-substreams.valve.city:443` → **26,742 transfer rows**;
`getHoldings(0xe01d7a51…, 943)` discovered the holder's **6 tokens** by `DISTINCT`
and read live `balanceOf` (WPLS 3571, the BLOCK family, native 781 v4PLS) — none
of them in any curated list.

## RPC key convention (applied to the registry)

- Valve RPC URL = `https://evm-{chainId}-rpc.valve.city/v1/{key}/evm/{chainId}`.
- **`vk_demo`** = public, per-IP-rate-limited → basic/one-off reads (portfolio
  `balanceOf`, dev defaults). The chain registry now defaults to it.
- **valve.city unlimited key** = sustained/production (the substreams stream;
  the legacy core RPC paths via `PULSECHAIN_RPC_URL` env override). Inject via
  env in production.

## Still TODO

- **Genesis backfill** for real holdings (the 200k window is a recent slice, not
  full history). On 943 it's fine to run from 0; for **369 mainnet** it's the
  ClickHouse + `(holder,token)` MV job on a dedicated box, and the spkg needs a
  **mainnet-network** repack (currently `pulsechain-testnet-v4`).
- The sink belongs **on/near the firehose box** for production (sustained,
  large) — not this laptop. The local run was a prototype validation.

**Local prototype artifacts (ephemeral, NOT committed, this machine only):**
throwaway Postgres on `:5432` (`valvetech/valvetech`), `public.transfers`
(26,742 rows) + `holdings_943.transfers` view; gzip-era CLIs in `~/.local/bin`
(`substreams-sink-sql-v4.12.0`); runner + token in the job tmp dir.
