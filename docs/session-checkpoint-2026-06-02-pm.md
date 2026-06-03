# Session checkpoint — 2026-06-02 PM

Continuation of the 2026-06-02 morning session (sync hardening). This PM block
split into two threads: finishing the workspace-sync hardening sweep, then a
deep pivot into the **portfolio tracker** and its data-layer architecture.

## Thread A — workspace sync hardening (shipped, pushed)

All four follow-ups from the morning checkpoint, on `main`, gates green:

| Commit | Subject |
|---|---|
| `972fdbd` | `feat(api)`: auth_nonces vacuum cron (`nonceVacuum.ts`, hourly + boot sweep) + `SESSION_SECRET` documented in `.env.example`. 5 unit tests. 420→425 API. |
| `19a6c4a` | `feat(web)`: persist autoPush watermark per-address (`syncWatermark.ts`) + 14 RTL state-machine tests for `useWorkspaceSync`. 515→536 web. |

## Thread B — portfolio tracker (in progress, NOT committed)

The user reframed Phase 2a from notifications → **portfolio tracker** ("mostly a
portfolio tracker"), then steered the data source hard: **TrueBlocks, not
Blockscout**; **no USD in v1** (amounts only); **build the real ChainConfig
registry now**.

### What's built + validated (uncommitted)
- **`services/chains/registry.ts`** — the 2026-05-29 spec's `ChainConfig`
  registry (`getChain`/`isSupportedChain`/`listChains`, `DEFAULT_CHAIN_ID`).
  Seeds 1/369/943. **chifra slugs verified against the daemon**: 1=`mainnet`,
  369=`pulsechain`, 943=`pulsechain-v4` (symbol `v4PLS`, NOT the web registry's
  `tPLS`/`pulsechain-testnet` — discrepancy to reconcile). 9 unit tests.
- **`services/chains/clients.ts`** — `getRpcClient(chainId)` memoized viem
  client factory (the spec's design). Additive; legacy `rpc.ts` untouched.
- **`services/portfolio/holdings.ts` + `transforms.ts`** — `getHoldings`
  interface + pure transforms + 30 unit tests. **NOTE: the chifra discovery
  data-path inside is SUPERSEDED** (see below); the interface/types/cache stay.
- **`packages/indexer/`** — Ponder 0.16 stopgap indexer. Validated: `ponder
  codegen` ✓, `tsc` ✓. Curated token set (WPLS/HEX/PLSX/INC, metadata verified
  on-chain — HEX is 8 decimals), seed-on-first-sight + delta handler,
  `token_balance`/`token_meta` in an isolated `indexer` Postgres schema.

Test counts: API 455 unit (was 425), all green. API + indexer tsc clean.

### Key findings that drove the architecture (all measured live)
1. **chifra `export --assets` needs an archive node** — PulseChain's chifra
   node is non-archive (mainnet is Erigon archive). Canonical holdings path
   unavailable on our primary chain.
2. **chifra holder-log discovery is too slow** — 52s/1000 logs, genesis-forward,
   incomplete. `docs/CHARTING.md` already hit this exact wall and chose
   `eth_getLogs` instead. chifra `tokens` with `parts` drops the balance field
   and returns empty symbol/name.
3. **reth `eth_getLogs` discovery is fast** (~2s/1M blocks) but a full-history
   sweep exceeds the RPC's 10s cap → must batch; it's a scan, not an index.

### Decisions (with the user)
- **Long-term data layer: firehose substream** — one deterministic pipeline
  feeds BOTH holdings AND the XYK price index. A PulseChain firehose endpoint
  **already exists/planned** in the Valve fleet — **URL still needed**.
- **Short-term stopgap: Ponder indexer** (built). Curated set only — user's
  caveat: a chain-wide Transfer index exhausts disk before the firehose rebuild.
- **No USD in v1** → no fiat total / no cross-asset allocation pie until prices
  land (the XYK indexer is the chain-local price source).

### Specs written (carved out)
- `docs/superpowers/specs/2026-06-02-xyk-price-indexer-firehose-design.md` —
  deterministic constant-product (XYK) price indexer via firehose; reserve-ratio
  pricing from `Sync` events; priced swaps; feeds portfolio USD + charts.
- `docs/superpowers/specs/2026-06-02-portfolio-holdings-data-layer-design.md` —
  the firehose-vs-chifra-load decision; Ponder stopgap; what's built.
- Plan: `~/.claude/plans/binary-frolicking-seal.md` (approved).
- Memory: `project_xyk_price_indexer.md`.

## Next step (precise)
**Repoint `getHoldings` off the superseded chifra path** to read the indexer
tables (`indexer.token_meta` = universe, `indexer.token_balance` = holder rows)
with a `balanceOf` fallback (via `getRpcClient`) for indexed tokens the holder
has no row for. **Blocker:** Ponder stores `hex()` columns as Postgres `bytea` —
verify the encoding against a *running* indexer, OR query Ponder's SQL/GraphQL
HTTP API to avoid coupling. Running the indexer needs the **Valve archive RPC**
(for seed-on-sight historical `balanceOf`) + Postgres — infra creds not present
this session. Then: holdings route (Slice 3), frontend data layer (Slice 4),
workspace rollup (Slice 5).

## Open asks for the user
- ~~Firehose endpoint URL~~ — RESOLVED: `evm-{chainId}-substreams.valve.city`
  (gRPC), `evm-943-substreams.valve.city` first (testnet, being stood up / not
  yet live). Wired into `ChainConfig.substreamsEndpoint`. Substreams-sink-sql
  consumption model recorded in the data-layer spec.
- **Notify when `evm-943-substreams` is live** so the substream/sink can be run
  + verified (and confirm it serves firehose-ethereum block protos so generic
  EVM ERC-20 substreams `.spkg`s run unmodified).
- **Archive RPC access** to run the Ponder backfill + verify end-to-end.
- Reconcile the 943 symbol/slug discrepancy (`v4PLS`/`pulsechain-v4` backend vs
  `tPLS`/`pulsechain-testnet` in `packages/web/src/lib/chains.ts`).

## Uncommitted working tree
`packages/api/src/services/chains/`, `services/portfolio/`,
`tests/unit/{chainRegistry,portfolioHoldings,portfolioTransforms}.test.ts`,
`packages/indexer/` (new), 2 new specs, `.env.example` (SESSION_SECRET — already
committed in 972fdbd). Pre-existing stale files (`debugger-after-fix.png`,
multichain spec) still untracked.
