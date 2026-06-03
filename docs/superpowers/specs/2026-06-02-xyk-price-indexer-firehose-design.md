# Design: Deterministic XYK Price Indexer (Firehose) — priced swaps + charts

## Status

Design — **not yet implemented.** Carved out 2026-06-02 alongside the
Workspace portfolio tracker (`/Users/.../plans/binary-frolicking-seal.md`),
which ships **amounts-only, no USD** in v1. This indexer is the intended
**chain-local, deterministic price source** that later unlocks USD valuation
for the portfolio AND a new explorer surface: per-pair price charts + priced
swap feeds.

## Motivation

Explore has no price data today. The existing charting (`docs/CHARTING.md`,
`useTokenTransfers`, `TransferChart`) is transfer **counts/volume** via
`eth_getLogs` — never price. For a PulseChain-first explorer, off-chain price
APIs (CoinGecko/etc.) have thin, lagging coverage. The prices that matter live
**on-chain in the AMM pools**.

The insight: for **constant-product (XYK, `x·y=k`) pairs** — Uniswap V2 forks,
i.e. PulseX V1/V2 and the long tail — spot price is a **closed-form function of
reserves**, so it needs no oracle and no off-chain feed:

```
price(token0 in token1) = (reserve1 / 10^dec1) / (reserve0 / 10^dec0)
```

Every reserve change emits `Sync(uint112 reserve0, uint112 reserve1)` (V2
pairs emit `Sync` after every mint/burn/swap). Indexing `Sync` per pair yields
a **price at every block where the pair moved** — deterministic, gap-free, and
reproducible from chain data alone.

## Why firehose (determinism + shareability)

A firehose (StreamingFast-style) is an ordered, replayable, fork-aware stream
of block data (blocks, logs, traces, balance changes). Running a **pure
mapping** (`Sync` log → price record) over a firehose range is deterministic:
the same `[firstBlock, lastBlock]` + the same mapping version ⇒ byte-identical
output. That gives us two properties off-chain APIs can't:

1. **Reproducible** — anyone can re-derive the price series from the chain and
   verify a shared artifact, rather than trusting our database.
2. **Shareable** — the resulting price index can be content-addressed (a CID
   per `(chain, mappingVersion, blockRange)` artifact), pinned to IPFS, and
   composed with the IPFS-frontend thread (workspace Phase 2c). "Here's the
   price index, verify it yourself."

This pairs with the determinism story the rest of the platform already leans on
(reproducible traces, the encrypted-sync "backend never decrypts" stance).

## Scope

**In:** XYK / constant-product V2-style pairs only. Closed-form reserve-ratio
pricing. `Sync`-driven price-at-block series per pair. Priced `Swap` decoding
(annotate each swap with executed price + base-currency value). Pair discovery
via factory `PairCreated` events.

**Out (v1 of the indexer):** Concentrated-liquidity / V3 (`x·y=k` doesn't
hold — price is per-tick, needs `slot0`/tick math — a separate mapping).
Stable-swap curves (Curve-style). TWAP oracles. Anything requiring a price for
a token with no XYK pool against the numéraire graph.

## Architecture (proposed)

```
firehose(chain) ──► xyk-mapping (pure) ──► price store ──► /api/prices ──► charts
   Sync/Swap/             reserve→price        per-pair        + priced       (explorer)
   PairCreated            decode + value       block series    swap feed      portfolio USD
```

1. **Pair registry.** Scan factory `PairCreated(token0, token1, pair)` for the
   known XYK factories per chain (PulseX V1/V2 routers/factories on 369; the
   uni-V2 factory on 1). Store `pair → (token0, token1, dec0, dec1)`.
2. **Reserve series.** Map every `Sync` for a registered pair to
   `(pair, blockNumber, reserve0, reserve1)`. Price at block = reserve ratio
   (decimals-adjusted). This is the deterministic core.
3. **Numéraire graph.** Pick a base per chain (e.g. WPLS on 369, WETH on 1) and
   a stable anchor (a WPLS/stable pair → USD; WETH/USDC → USD). Any token's
   USD price = its price in the base via its deepest base-paired pool, times
   the base's USD price. Choose the **deepest-liquidity** path to resist
   manipulation by thin pools.
4. **Priced swaps.** Decode `Swap(sender, amount0In, amount1In, amount0Out,
   amount1Out, to)`; executed price = out/in ratio; value via the numéraire
   graph at that block.
5. **Serving.** `/api/prices?pair=…&window=…` (OHLC/line series) and
   `/api/prices/token?address=…&chainid=…` (current + historical USD). Reuse
   the `respond`/`asyncRoute` envelope and the `ChainConfig` registry (built in
   the portfolio slice 1). Charts reuse the SVG pattern in
   `GasBarChart.tsx` / `TransferChart.tsx` (no charting lib).

## How it feeds the portfolio

The portfolio tracker's documented USD follow-up becomes: for each `Holding`,
look up `token USD price at head` from this indexer; multiply by
`balanceDec`. That unlocks the **fiat total** and the **cross-asset allocation
pie** the original portfolio mock showed — without an off-chain dependency, and
chain-local for PulseChain where external coverage is weakest.

## Decision points

1. **Firehose availability.** Do we run a firehose/substreams stack for
   PulseChain (369/943), or bootstrap the same mapping over **chifra** /
   `eth_getLogs` first and swap the source in later? (chifra already indexes
   all three chains — `status?chains=true` confirms mainnet/pulsechain/
   pulsechain-v4. A chifra-sourced v0 ships sooner; firehose buys determinism +
   throughput. The mapping is source-agnostic if we keep it pure.)
2. **Numéraire + anti-manipulation.** Which base/stable anchors per chain, and
   the min-liquidity threshold for a pool to count toward a token's price.
3. **Storage vs. recompute.** Persist the price series (new Postgres tables +
   a backfill/tail worker) vs. compute-on-demand over a window (like the
   current charts). Per-block series for all pairs is large — likely persist,
   with the shareable CID artifact as the cold/all-time form.
4. **Factory coverage.** Which XYK factories to register per chain (PulseX V1,
   V2, 9MM, etc. on 369). Pair discovery is the gating completeness question.
5. **Shareable artifact format.** CID-per-`(chain, mappingVersion, range)`;
   schema + verification tooling so a third party can confirm a published index.

## Substreams endpoints (resolved 2026-06-02)
Per-chain substreams gRPC endpoints follow `evm-{chainId}-substreams.valve.city`
(`evm-943-substreams.valve.city` confirmed first, testnet). The XYK price
substream runs against the same endpoint as the holdings substream — one
`.spkg` can emit both `Sync`/`Swap` price modules and balance-change modules,
or two modules sharing the firehose. Sink via `substreams-sink-sql` → Postgres.

## Open operational questions
- Endpoints are being stood up ("will be") — confirm when `evm-943-substreams`
  is live + whether it serves standard firehose-ethereum block protos (so
  generic EVM substreams modules run unmodified).
- V3/concentrated-liquidity share on PulseChain — is XYK-only enough coverage
  for a useful price set, or do we need the V3 tick mapping sooner than "later"?

## Sequencing (rough)
- **v0 (chifra-sourced):** pair registry + `Sync` reserve series over a window
  via the existing chifra/`eth_getLogs` path → single-pair price chart. Proves
  the math + UI. Days, not weeks.
- **v1 (deterministic):** firehose mapping + persisted series + numéraire graph
  → token USD + priced swaps + portfolio valuation.
- **v2 (shareable):** content-addressed artifact + IPFS pin + verifier.
