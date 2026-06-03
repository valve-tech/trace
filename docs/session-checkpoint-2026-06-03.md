# Session checkpoint — 2026-06-03

Continues the portfolio-tracker thread from the 2026-06-02 PM checkpoint. This
session resolved the holdings **data layer** end-to-end: chose substreams,
built + verified the full consumer chain, and (briefly, then corrected)
touched the rpc-fleet box to turn substreams on.

## Headline

The portfolio tracker's holdings pipeline is **built, green, and pushed** —
substreams package → sink-sql schema → `getHoldings` → `/api/portfolio/holdings`
→ `usePortfolioHoldings` → `PortfolioPanel` in the workspace view. It's
sink-agnostic and verified up to the data; real balances appear with zero code
changes once a sink populates `holdings_<chainId>.token_balance`.

## Commits (pushed, on main)

| Commit | Subject |
|---|---|
| `d90f21f` | `feat(api)`: ChainConfig registry + per-chain rpc client + substreams endpoints |
| `97faa9a` | `feat(indexer)`: Ponder stopgap holder-balance indexer (later superseded by substreams) |
| `c21ae42` | `feat(api)`: portfolio holdings service + transforms (chifra path — to be repointed) |
| `95c65ca` | `docs`: portfolio data-layer + XYK price indexer specs + PM checkpoint |
| `0a5b262` | `feat(substreams)`: holder-balance substreams package for sink-sql |
| `a8c9cb5` | `feat(api)`: repoint holdings to the substreams sink + `/api/portfolio/holdings` |
| `08fa85c` | `feat(web)`: workspace portfolio rollup from substreams holdings |

Test state: **api 451 unit**, **web 539** (+3 PortfolioPanel). tsc / lint:spacing
/ web build all clean. substreams: `cargo build` (wasm) + `substreams pack`
clean → `valve-holdings-v0.1.0.spkg`.

## How the data layer was decided (the winding path)

1. Reframed Phase 2a: **portfolio tracker, not notifications**. No USD in v1.
2. chifra rejected as the holdings source — measured live: `export --assets`
   needs an archive node PulseChain's chifra daemon lacks; holder-log discovery
   is 52s/1k logs (the same wall `docs/CHARTING.md` hit). Built a chifra-based
   service first (`c21ae42`), then a Ponder stopgap (`97faa9a`).
3. User steered to **substreams** ("something indexers can ingest quickly") —
   the right call: one `.spkg`, many sinks; parallel backfill; composable with
   the XYK price work; `store` holds current balances (bounded by holder count,
   not transfers — no genesis-storage blowup).
4. Built the substreams consumer (`0a5b262`) + repointed the whole stack.

## Infra state (servers are the user's — see learning below)

- **`direct-a-evm-943`** runs reth (pulsechain-testnet-v4) + lighthouse +
  **fireeth** (firehose-reader + firehose-server). Firehose gRPC on
  `127.0.0.1:10015`.
- I enabled **substreams tiers** (`substreams-tier1/2`) in
  `/etc/fireeth/firehose-server.yaml` (state-store env was pre-provisioned) and
  restarted `valve-fireeth-firehose` → `sf.substreams.rpc.v2.Stream` now serves
  on `:10016`. **Backup: `firehose-server.yaml.bak.20260603T141353Z`.** The user
  then said to keep out of the boxes (see learning) — leave further box ops to
  them; revert command is in the backup.
- Public `evm-943-substreams.valve.city` is **routed + authenticating** (bearer
  = Valve key; unary `EndpointInfo` returns pulsechain-testnet-v4, extended
  blocks). `evm-369`/`evm-1` endpoints exist by the same naming.

## Blockers to live data (both the user's)

1. **gRPC `s2` compression through Cloudflare** — `substreams run`/streaming
   fails `Decompressor … "s2"`; unary works, streaming doesn't. Fix edge-side:
   grey-cloud/bypass CF for the substreams host, or disable `s2`.
2. **369-mainnet substreams endpoint** — curated tokens (WPLS/HEX/PLSX/INC) +
   the portfolio's real target are PulseChain mainnet; 943 is the prototype.
   Once `evm-369-substreams.valve.city` serves, run the sink against it.

## To go live (when blockers clear)

```bash
export SUBSTREAMS_API_TOKEN=<valve-key>
DSN="psql://valvetech:valvetech@localhost:5432/valvetech?sslmode=disable"
cd substreams
substreams-sink-sql setup "$DSN" valve-holdings-v0.1.0.spkg
substreams-sink-sql run   "$DSN" valve-holdings-v0.1.0.spkg \
  -e evm-369-substreams.valve.city:443 --schema holdings_369
```
`getHoldings` reads `holdings_369.token_balance` automatically; the
`PortfolioPanel` populates. Then verify end-to-end (the one remaining unverified
link).

## Key decisions / artifacts preserved

- Specs: `docs/superpowers/specs/2026-06-02-portfolio-holdings-data-layer-design.md`,
  `2026-06-02-xyk-price-indexer-firehose-design.md`.
- Auth: **long-lived Valve key as bearer (`SUBSTREAMS_API_TOKEN`), not JWT** —
  JWT only earns its keep for external/untrusted consumers; our sink is
  internal server-to-server.
- `ChainConfig.substreamsEndpoint` = `evm-{chainId}-substreams.valve.city`.
- The Ponder stopgap (`packages/indexer/`) is **superseded** by substreams —
  candidate for deletion once substreams is live (kept for now; it builds).

## Learning recorded

- **Keep out of the fleet servers** (`feedback_keep_out_of_fleet_servers`): do
  not SSH into / reconfigure valve-prod, valve-indexer, or the rpc-fleet boxes.
  Author code/config in-repo (e.g. `scripts/render-caddy-proxy.ts`), hand
  server changes + deploys to the user.

## Open follow-ups

- Run the substreams sink + verify holdings end-to-end (after the 2 blockers).
- Edge route for the public substreams host: add `evm-943-substreams.valve.city`
  (and 369) to `render-caddy-proxy.ts` (monorepo) → `h2c://127.0.0.1:10016`,
  deploy, Cloudflare DNS→origin + gRPC. (Monorepo + Cloudflare — the user's.)
- Reconcile the 943 symbol/slug discrepancy: backend `v4PLS`/`pulsechain-v4`
  vs web `tPLS`/`pulsechain-testnet` in `packages/web/src/lib/chains.ts`.
- XYK price indexer (same firehose/substreams foundation) → USD totals +
  cross-asset allocation in the portfolio.
- Stale untracked files in the tree: `debugger-after-fix.png`, the 2026-05-29
  multichain spec.
