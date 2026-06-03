# Session checkpoint — 2026-06-03 PM (holdings: curated store → all-transfers)

Continues the portfolio holdings thread. This session **redesigned the holdings
data model** and rewrote both the substreams package and the API consumer to
match, all green. The live sink run is **blocked on the s2/Cloudflare edge** and
is a **monorepo/infra task** — see the handoff at the bottom.

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

## s2 / token findings

- **`VALVE_KEY`** (in `monorepo/.env`) **is the substreams bearer** — auth
  confirmed working (a `substreams run` got past auth to the stream).
- The **s2/Cloudflare streaming blocker is NOT fixed**. `substreams run`
  through `evm-943-substreams.valve.city` still fails:
  `Decompressor is not installed for grpc-encoding "s2"`. Unary works,
  streaming doesn't. **No client-side flag dodges it** — s2 is negotiated
  server-side.
- `s2` = a Snappy-derived gRPC compression codec the firehose server uses; the
  compressed stream framing doesn't survive Cloudflare's edge.

---

## ▶ MONOREPO / INFRA HANDOFF (the next session's work — NOT trace)

The substreams **package** lives in `trace/substreams` and is done. **Running**
the sink, the **s2 edge fix**, and **deploy** are monorepo/Cloudflare/fleet
tasks (keep-out-of-fleet: author config in `render-caddy-proxy.ts`, run on the
box yourself).

**To get 943 prototype data flowing — pick one:**

1. **(preferred) Run the sink on `direct-a-evm-943`, internal, no Cloudflare:**
   ```bash
   export SUBSTREAMS_API_TOKEN="$VALVE_KEY"
   DSN="psql://<user>:<pw>@localhost:5432/<db>?sslmode=disable"
   substreams-sink-sql setup "$DSN" valve-holdings-v0.1.0.spkg     # creates `transfers`
   substreams-sink-sql run   "$DSN" valve-holdings-v0.1.0.spkg \
     -e 127.0.0.1:10016 --plaintext                                # internal tier → no s2/CF
   ```
2. **Grey-cloud / disable s2** on `evm-943-substreams.valve.city` if external
   streaming is wanted (only needed for consumers outside the box).

**API contract the sink must feed** (so holdings light up with zero API change):
- schema `holdings_<chainId>` (per `holdingsSchema()`), table **`transfers`**:
  `id, block_num, log_index, token, sender, recipient, value`; `token/sender/
  recipient` are **lowercase hex, no 0x**.
- the API does `DISTINCT token WHERE sender = $holder OR recipient = $holder`,
  then `balanceOf` per token. Native balance is a direct RPC call.

**For 369 mainnet (real target):**
- repack the spkg with the **mainnet network** (currently
  `network: pulsechain-testnet-v4`).
- sink to **ClickHouse** on a dedicated box; maintain the `(holder,token)`
  membership MV there. Wire the API's `discoverTokens` to that store.
- genesis backfill of ~26.7M blocks is a "kick off and let it run" job; wall
  clock depends on substreams tier2 parallelism.

**Local prototype artifacts (ephemeral, NOT committed, this machine only):**
- throwaway Postgres on `:5432` (`valvetech/valvetech`), `public.transfers`
  + `holdings_943.transfers` view.
- `substreams` + `substreams-sink-sql` CLIs in `~/.local/bin`.
- runner stub + staged token in the job tmp dir.
