# Session checkpoint — 2026-06-05 (holdings: client-only repoint to balance_changes)

Continues the portfolio holdings thread. This session **enforced the
client-only boundary for `trace`**, removed the substreams aggregation package
from this repo, and **repointed `getHoldings` to the `erc20-balance-changes`
archive** (storage-diff balances) behind a build-ahead transport seam. API
**456 unit tests passing**, `tsc` clean.

## Headline

The boundary got sharper and the holdings source changed under it:

- **`trace` is the CLIENT only.** It queries the final aggregated dataset and
  nothing else — *no deploy, no stand-up, no aggregation*. The substreams
  package (Rust module, schema, manifest, `.spkg`) is **monorepo's**, not
  trace's. Removed `trace/substreams/` this session (`git rm`).
- **Holdings source = `erc20-balance-changes` (storage-diff), not
  transfers+`balanceOf`.** A prior trace session spike-proved `new_balance ==
  balanceOf` 9/9 on 943; it's storage-slot truth → correct for
  rebasing/fee-on-transfer, airdrop-spam-immune, **zero read-time RPC for
  balances**. The `transfers` archive is demoted to the *transfer-history*
  source.

## The read-time contract (from the monorepo handoff)

ClickHouse table `balance_changes(contract, owner, amount, old_balance,
new_balance, transaction_id, block_num, timestamp, change_type, call_index)`,
populated by `monorepo/services/substreams-sinks/erc20-balance-changes`
(vendored `streamingfast/substreams-erc20-balance-changes` v1.4.0, repacked
`initialBlock:0`). Holdings = latest balance per `(contract, owner)`:

```sql
SELECT contract, argMax(new_balance, (block_num, call_index)) AS bal
FROM balance_changes WHERE owner = :holder GROUP BY contract HAVING bal > 0
```

Source: `monorepo/docs/superpowers/specs/2026-06-04-erc20-balance-changes-holdings-handoff.md`.

## What changed in `trace` (uncommitted in the working tree)

| File | Change |
|---|---|
| `substreams/**` | **removed** (`git rm`) — aggregation pkg belongs in the monorepo |
| `packages/api/src/services/portfolio/transforms.ts` | split balance from metadata: `HeldBalance` (archive) + `TokenMeta` (chain) → `mapHolding` (replaces `TokenRead`/`mapTokenRead`) |
| `packages/api/src/services/portfolio/holdings.ts` | `HoldingsDeps` = `queryBalances` (archive) + `readMetadata` (chain `decimals/symbol/name`, **no `balanceOf`**) + `nativeBalance`; dropped the `pg` import |
| `packages/api/src/services/portfolio/balanceSource.ts` | **new** — documents `BALANCE_CHANGES_QUERY`; null-returning build-ahead stub (→ `indexed:false`) until a query endpoint exists |
| `packages/api/src/routes/portfolio.ts` | docstring: balances from archive, not `balanceOf` |
| `packages/api/tests/unit/portfolio{Holdings,Transforms}.test.ts` | rewritten for the new deps/transforms |

## Architecture (as now understood)

```
ClickHouse  ──  balance_changes archive (Ethereum-scale)   ← monorepo builds/owns
   │             (erc20-balance-changes substreams → sink)
   ▼
Hasura-style GraphQL "subset" gateway  (preferred)  OR  ClickHouse HTTP
   │             ← stood up monorepo-side; DOES NOT EXIST YET
   ▼
trace  ──  CLIENT. getHoldings issues the argMax query for one holder's slice;
            metadata via cached chain multicall; native via RPC point-read.
```

## Decisions this session

1. **ClickHouse scope = blockchain-data path only.** `pg` still backs 16 API
   services (auth nonces, API keys, workspace blobs, tracer/slither/solc/
   decompiler/sourceCode caches) — OLAP is wrong for that mutable point-state.
   Only holdings/transfers/prices go ClickHouse-via-gateway.
2. **Transport deferred (build-ahead behind the seam).** GraphQL subset gateway
   (user's pref — trace never holds DB creds) vs direct ClickHouse HTTP, decided
   later; swapping is a one-file change in `balanceSource.ts`.
3. **`mapHolding` drops a held token when decimals can't be resolved** (no
   curated override *and* metadata read failed) — correctness over completeness.
   Flip to a fallback if never hiding a real holding is preferred.

## Still TODO / blocked on monorepo (NOT trace's to do)

- **Productionize the sink + expose a query endpoint.** `balance_changes` is a
  localhost-only ClickHouse prototype on the `indexer` box (95.217.41.159). No
  reachable endpoint yet → `getHoldings` correctly returns `indexed:false`.
- **Stand up the Hasura-style subset gateway** (or expose read-scoped ClickHouse
  HTTP). Then wire the adapter in `balanceSource.ts` (one file) + verify e2e.
- **369/1**: enable substreams tiers, `evm-{369,1}-substreams.valve.city`,
  mainnet spkg repack, genesis backfill (monorepo rollout doc
  `2026-06-04-substreams-holdings-history-rollout.md`).

## Housekeeping

- Change is **uncommitted** — left for review (deleting a committed package).
  Suggested message: `feat(api): repoint holdings to balance_changes archive;
  remove substreams pkg`.
- Two unrelated strays still untracked: `debugger-after-fix.png` and
  `docs/superpowers/specs/2026-05-29-multichain-etherscan-labels-design.md`
  (the latter is referenced by CLAUDE.md — likely should be committed).
- Memory updated: client-only boundary (`feedback_substreams_deploy_is_monorepo`)
  + new holdings model (`project_holdings_all_transfers`).
