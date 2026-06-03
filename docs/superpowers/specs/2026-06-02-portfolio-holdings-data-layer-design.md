# Design: Portfolio Holdings Data Layer — firehose substream vs. full chifra load

## Status

Design — **direction decided 2026-06-02**, implementation pending. Captured
after empirically proving synchronous on-demand holdings enumeration is not
viable against current infra. Pairs with the application-side plan
(`binary-frolicking-seal.md`, registry + holdings service interface already
built) and the
[XYK price indexer spec](./2026-06-02-xyk-price-indexer-firehose-design.md)
— a firehose substream is the shared foundation for both.

### Resolved
- **Long-term data layer: firehose substreams** (Option A below). Endpoints
  follow `evm-{chainId}-substreams.valve.city` (gRPC) — `evm-943-substreams.
  valve.city` (testnet) confirmed by the user 2026-06-02 as the first target;
  1/369 by the same naming. Wired into the `ChainConfig` registry as
  `substreamsEndpoint`. The substream feeds both the holdings store and the XYK
  price store. **943 (testnet) first** to prototype before 369/1.
- **Consumption model:** a substreams `.spkg` module → `substreams-sink-sql`
  → Postgres → the API reads. Prefer a published/generic EVM ERC-20
  balance-changes `.spkg` over hand-written Rust/WASM for v1 if one runs against
  the Valve firehose; only write a custom module if needed. (Endpoints are
  being stood up — "will be" — so this is build-ahead, run-when-live.)
- **Short-term stopgap: a Ponder indexer** (`ponder.sh`, TS-native). Caveat
  from the user: a full chain-wide Transfer index will exhaust disk before the
  firehose rebuild lands — so the Ponder app MUST be storage-scoped (curated
  token set, not all-tokens). See "Stopgap" below.

The 2026-05-31 checkpoint already flagged "firehose-derived pricing … a wholly
separate architectural decision." This doc is that decision, widened to holdings.

## Problem

"What does address X hold?" requires enumerating X's token universe + current
balances. Measured against the live infra (chifra.valve.city + public reth):

| Approach | Result |
|---|---|
| chifra `export --assets` (canonical) | **Fails** on PulseChain — "requires an archive node." The chifra mainnet node IS Erigon archive; the **PulseChain** node is not. |
| chifra `export --logs` (holder-scoped) → decode Transfer | Works without archive but **52s / 1000 logs**, genesis-forward, incomplete under a record cap. Same latency wall `docs/CHARTING.md` hit (it sidelined chifra for `eth_getLogs`). |
| chifra `tokens` (balances) | Works (~1.3s/token) but `parts` **drops the balance field**, and `name`/`symbol` return **empty**. |
| reth `eth_getLogs` holder-topic discovery | **Fast** (~2s/1M blocks) but a full-history sweep exceeds the RPC's 10s query cap → must batch; still a synchronous workaround, not an index. |

Conclusion: there is no fast, complete, synchronous holdings answer today.
Holdings needs a **real index** keyed by (holder → token → balance), maintained
ahead of query time.

## Options

### A. Firehose substreams (chosen)
Consume the Valve substreams endpoints (`evm-{chainId}-substreams.valve.city`,
943 first) with a deterministic substream that maps **balance-affecting
events** to a `(holder, token, block) → balance` store via
`substreams-sink-sql`:
- ERC-20/721 `Transfer` → debit `from`, credit `to`.
- Native value transfers + fee burns → native balance deltas.
- The **same substream pipeline** emits `Sync`/`Swap` for the XYK price index —
  one firehose investment, two features (holdings + pricing).

Holdings query = point lookup in the store at head. Fast, complete,
deterministic, shareable (content-addressable per the XYK spec). The
already-built `getHoldings(holder, chainId)` service swaps its body to read
this store; its interface + the `ChainConfig` registry are unchanged.

**Cost:** net-new infra. No firehose exists in the repo/fleet today. Requires:
a firehose endpoint (firehose-ethereum reader against the reth/erigon fleet),
the substream modules (Rust + protobufs), a store (Postgres or the
content-addressed artifact), and a serving path. Multi-day, part ops.

### B. Full chifra chain load
Pre-build + pin the complete chifra index AND run an **archive + tracing**
node per chain so `export --assets` accounting works on demand. Mainnet
already qualifies (Erigon archive); **PulseChain does not** — this option is
blocked on standing up an archive/tracing PulseChain node for the chifra
daemon, then a full scrape.

**Cost:** ops-heavy on the daemon side, chain-by-chain. Serves holdings only —
**not** the XYK pricing the user also wants. Even loaded, per-address
`export` formatting latency remains (vs. a point lookup).

### C. Stopgap — Ponder indexer (chosen short-term)
A `ponder.sh` app indexes ERC-20 `Transfer` events into a Postgres
`(holder, token) → balance` projection; `getHoldings` queries it (point
lookup). TS-native, fits the monorepo, ships in days.

**Storage discipline (the user's caveat):** indexing *every* token chain-wide
will exhaust disk. So v0 indexes a **curated token set** (the high-value
PulseChain universe — WPLS, HEX, PLSX, INC, major stables/bridged assets) from
a sensible start block. Holdings = the tracked address's balances within that
set. Misses the long tail; the firehose substream fixes that. Re-scope the set
or start block if disk pressure appears.

Integration: Ponder runs as its own process writing to a dedicated Postgres
schema; the API's `getHoldings` reads that schema (or Ponder's SQL/HTTP API)
behind the unchanged interface. Adds a dev process + a deploy unit.

### D. (Rejected) synchronous reth `eth_getLogs` + viem multicall
A per-request scan, not an index — re-walks history on cache miss. The user
wants a real indexer; Ponder (C) is the chosen stopgap instead.

## Recommendation

**Option A — firehose substream**, because:
1. It's the only option that serves **both** holdings and the XYK price index
   the user has now pointed at twice; one foundation, two product surfaces.
2. It's deterministic + shareable, matching the platform's repro stance and
   the IPFS-frontend thread.
3. Option B is blocked on PulseChain archive infra anyway and never serves
   pricing — so even pursuing B leaves the firehose work undone.

Sequencing:
- **Step 0 (gating):** confirm/stand up a PulseChain firehose endpoint. Is one
  already planned for the Valve fleet (alongside `evm{N}-snapshot-reth`), or
  net-new? This blocks everything in A.
- **Step 1:** substream → holdings store + `getHoldings` reads it.
- **Step 2:** same substream → `Sync`/`Swap` → price store (the XYK spec).
- **Optional stopgap:** ship Option C behind `getHoldings` so the portfolio UI
  (slices 4–5) is demoable while the substream is built — clearly labeled
  "live scan, not indexed."

## What's already built (not wasted)
- `services/chains/registry.ts` — per-chain config incl. `chifraChain` slug.
- `services/portfolio/holdings.ts` — `getHoldings(holder, chainId)` interface +
  transforms + cache. Only the **data-source body** changes when the index
  lands. (Currently wired to the chifra discovery path that proved too slow —
  to be repointed.)

## Decision points
1. **A vs. B** — confirm firehose substream over full chifra load.
2. **Firehose endpoint** — exists or net-new? Who owns standing it up?
3. **Stopgap?** — ship Option C behind the interface now for a demoable UI, or
   wait for the real index before any portfolio UI?
4. **Store shape** — Postgres `holder_balances` projection vs. content-
   addressed artifact (or both, per the XYK shareability goal).
