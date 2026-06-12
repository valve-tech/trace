# @valve-tech/explore-indexer

**Stopgap** Ponder indexer that maintains a `(holder, token) → balance`
projection for a **curated** PulseChain token set, so the portfolio tracker can
read holdings without a slow per-request chain scan.

> This is temporary. The real data layer is a deterministic **firehose
> substream** that serves both holdings and XYK prices — see
> `docs/superpowers/specs/2026-06-02-portfolio-holdings-data-layer-design.md`.
> When that lands, delete this package and repoint `getHoldings`.

## Why curated (storage)

Indexing every ERC-20's `Transfer` chain-wide would exhaust disk. This indexer
only watches the allowlist in [`src/tokens.ts`](./src/tokens.ts) (WPLS, HEX,
PLSX, INC to start — metadata verified on-chain). Extend it deliberately;
each high-volume token (HEX, PLSX) adds real storage.

## How balances stay correct without a genesis sync

Ponder accumulates balances from `Transfer` deltas. Starting at a recent
`INDEXER_START_BLOCK` would normally give wrong balances for holders who
received tokens earlier. Instead, on **first sight** of a `(holder, token)`
pair we seed the true balance via `balanceOf` at the event's block, then apply
signed deltas forward (see [`src/index.ts`](./src/index.ts)).

- Requires an **archive** RPC for historical `balanceOf` during backfill — use
  the Valve reth fleet (`PULSECHAIN_RPC_URL`).
- Holders the index has never observed since `START_BLOCK` are covered by a
  `balanceOf` fallback in the API's `getHoldings`, so query-time correctness
  never depends solely on this index.

## Schema (`ponder.schema.ts`)

- `token_balance` — PK `(holder, token)`, `balance` (raw integer), `updatedBlock`.
- `token_meta` — PK `token`, `symbol`, `name`, `decimals`.

Written to the Postgres `indexer` schema (isolated from API migrations).

## Run

```bash
cp .env.example .env        # point at an archive RPC + Postgres
npm install                 # from repo root (workspace)
npm run codegen --workspace=packages/indexer   # generate ponder:* types
npm run dev    --workspace=packages/indexer     # index + serve GraphQL/SQL on :42069
```

`ponder dev` backfills from `START_BLOCK` then follows head. The API reads the
`indexer.token_balance` / `indexer.token_meta` tables (or Ponder's SQL/HTTP
API) — see the holdings service.

## Not wired into `npm run dev` / docker by default

The indexer is an independent process with a heavy dep tree and its own
lifecycle (backfill). Run it on its own while it's a stopgap; promoting it into
the root `dev` script + `docker-compose` is a deliberate follow-up.
