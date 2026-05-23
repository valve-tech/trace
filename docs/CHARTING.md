# Token Charting

Per-token time-series charts driven by chifra-indexed event data, cached in
the browser's IndexedDB. This doc captures the design decisions for v1 and
the cache-release pattern.

---

## 1. Goals

- **Show meaningful per-token time-series on demand** — transfer counts,
  volumes, unique participant counts over user-selectable windows.
- **No new backend storage cost** — chifra is the data source; the API
  proxies. The browser holds the working set.
- **Survive page reloads + offline.** A cached chart should render before
  any network call returns.
- **Stay inside a user-storage budget.** Up to ~80% of the browser's
  reported quota for chart data; defined release rules above that.

Non-goals for v1:

- Holder distribution / top-holders rankings (requires aggregator pass on
  every Transfer event — punt per `EXPLORER_API_SPEC.md` §2.8).
- Realtime updates (websocket / SSE). Charts refresh on user action, not
  on every new block.
- Cross-token charts (portfolio views, correlation, etc.).

---

## 2. Architecture

```
┌─────────────────┐    HTTPS   ┌──────────────────┐    HTTPS   ┌────────────────────┐
│  web (browser)  │  ────────► │  api (Express)   │  ────────► │ chifra.valve.city  │
│                 │  /api/     │                  │  /export?  │  (TrueBlocks)      │
│  ┌──────────┐   │  chifra    │  ┌────────────┐  │  chain=pls │                    │
│  │ ChartView│   │            │  │ chifra svc │  │            │                    │
│  └─────┬────┘   │            │  └────────────┘  │            └────────────────────┘
│        │        │            │                  │
│  ┌─────▼────────┐│            │  in-memory TTL  │
│  │ chartCache   ││            │  cache (1h TTL, │
│  │ (IndexedDB)  ││            │  500 entries,   │
│  │ separate DB  ││            │  FIFO eviction) │
│  └──────────────┘│            └──────────────────┘
└─────────────────┘
```

**Why backend proxy and not direct browser → chifra:**

1. Chifra likely doesn't have permissive CORS for valve-tech web origins
   (it's an internal self-hosted instance).
2. API can add its own request/response logging and rate-limit per IP.
3. API can normalize the response shape — chifra's `?fmt=json` envelope
   (`{ data: [...] }`) becomes a flat array at the boundary.
4. The existing in-memory cache pattern (see
   `packages/api/src/services/decoder/abiCache.ts`) gives us a free hot
   layer before the IDB cache sees a request.

**Why a separate IndexedDB store and not the TanStack Query persister:**

1. The Query persister serializes the *entire* client state into one
   `idb-keyval` blob on every write. A 5MB chifra export would dominate
   that blob and slow every other query's persist call.
2. Eviction policy mismatch — Query persister evicts by *count of queries*
   (`MAX_QUERIES=1000` in `lib/idbPersister.ts:5`), chart data needs
   *byte-budget* eviction.
3. Partial-corruption blast radius — Query persister is one big blob, so
   corruption loses everything. A dedicated store can isolate damage to
   the affected entry.

---

## 3. Data sources — chifra endpoint patterns

### Transfer events for a token

```
GET https://chifra.valve.city/export
    ?addrs=<token-address>
    &logs=true
    &articulate=true
    &chain=pulsechain
    &fmt=json
```

Response: every log emitted from or to the token's address. Articulated
fields give us `from / to / value / tokenId` decoded out of the box —
no per-event ABI lookup needed.

Filter server-side to standard transfer topics:
- ERC-20: `Transfer(address indexed, address indexed, uint256)` — topic
  `0xddf252ad...`
- ERC-721: same signature, disambiguated by indexed-topic count (3 vs 2)
- ERC-1155: `TransferSingle` / `TransferBatch` (different topics)

### Time-range scoping

Chifra's `/export` accepts block ranges via reserved param names that we
need to **verify against the deployed version** before relying on:
`last_block`, `first_block` were rejected at probe time (2026-05-23).
The route may need `--start_block` / `--end_block` or another convention;
to be confirmed during implementation.

Fallback if no block-range filter works: fetch the entire export,
slice client-side. Acceptable for moderate-activity tokens, untenable
for high-frequency contracts (PulseX Router will choke).

### What chifra does NOT give us

- **Price.** Chifra is an appearance index. Price = swap data correlated
  with USD oracle. Out of scope for v1.
- **Per-second granularity.** Block times on PulseChain are ~10s; the
  finest chart bucket should be `block` or `hour`.
- **Forward-looking projections.** Historical only.

---

## 4. Cache schema (IndexedDB)

**Database name:** `valvetech-chart-cache` (separate from
`valvetech-query-cache`).

**Version:** 1.

### Object stores

#### `transfers`

Stores raw articulated chifra exports, scoped to a token + block range.

| Field | Type | Notes |
|---|---|---|
| `key` | `string` | Primary key: `${tokenAddress}:${blockMin}-${blockMax}` lowercased |
| `tokenAddress` | `string` | Lowercased token contract address |
| `blockMin` | `number` | Inclusive lower bound |
| `blockMax` | `number` | Inclusive upper bound |
| `records` | `TransferRecord[]` | Articulated transfer log entries (see below) |
| `sizeBytes` | `number` | `JSON.stringify(records).length` (approximate) |
| `cachedAt` | `number` | `Date.now()` at insert |
| `lastAccessed` | `number` | `Date.now()` at last read; index `byLastAccessed` |

Indexes:
- `byToken` on `tokenAddress` (for per-token sweeps).
- `byLastAccessed` on `lastAccessed` (for LRU eviction).

#### `TransferRecord` shape (normalized at API boundary)

```ts
type TransferRecord = {
  blockNumber: number;
  blockTimestamp: number; // unix seconds
  txHash: `0x${string}`;
  logIndex: number;
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;          // decimal string; bigint at render time
  variant: "erc20" | "erc721" | "erc1155-single" | "erc1155-batch";
  tokenId?: string;       // ERC-721 / ERC-1155 only
};
```

---

## 5. Storage release pattern

Three rules, applied in priority order:

### Rule 1 — Hard quota (80% of estimated quota)

On every cache write:

```ts
const { quota = 0, usage = 0 } = await navigator.storage.estimate();
const budget = quota * 0.8;
if (usage > budget) await evictUntil(quota * 0.6);
```

`evictUntil(target)` walks the `byLastAccessed` index ascending, deleting
entries until total usage is below `target`. Targeting 60% leaves
headroom so we don't oscillate near the wall.

### Rule 2 — Stale-while-revalidate (1 hour TTL)

On read, if `cachedAt + 60 * 60 * 1000 < Date.now()`, the entry is **served
immediately** but a background refresh is kicked off. Stale data is
better than no data while the network round-trips.

### Rule 3 — Manual token-scope eviction

`evictToken(address)` deletes all entries for one token. UI surfaces this
behind a "Clear cached data for this token" button on the chart tab,
mostly for debugging.

### Quota by browser

| Browser | Reported quota | Effective ceiling |
|---|---|---|
| Chrome (desktop) | ~60% of free disk | Often 10s of GB |
| Firefox | ~50% of free disk | Often 10s of GB |
| Safari (macOS 14+) | ~80% of free disk | But aggressive 7-day eviction on inactive origins |
| Safari (iOS) | ~1GB hard cap | Eviction more aggressive |

Implementation gate: if `quota < 50MB` (Safari mobile in some states),
disable cache writes entirely and rely on the in-memory layer + API
proxy. UI shows a "Charts available, caching disabled" notice.

---

## 6. UI surface (v1)

New `chart` sub-tab on `ContractView` (sibling to `read`/`write`/`abi`/
`source`). Visible only when the contract's ABI shows ERC-20 or ERC-721
shape (heuristic: has `Transfer(address,address,uint256)` event +
`balanceOf(address) → uint256` function).

The tab renders:

1. A window picker — `1h / 24h / 7d / 30d`. Defaults to `24h`.
2. ONE chart in v1: **transfer count, bucketed by hour for 24h / by day
   for larger windows**.
3. Below the chart: a thin status line — `N transfers · cached 4m ago ·
   refresh` (refresh = manual cache bypass).

Future charts (post-v1, in order of likely value):

- Transfer volume (sum of `value`) over the same window — needs token
  decimal handling. Decimals fetched separately via `eth_call`
  `decimals()`, cached per-token.
- Unique senders / unique receivers count.
- Top N receivers in window (table, not chart).
- Mint/burn ratio if the token has identifiable mint addresses
  (zero-address as sender = mint, zero-address as recipient = burn).

---

## 7. Build sequence (v1)

1. **API service** — `packages/api/src/services/chifra/` with `getTransfers(token, window)` returning normalized `TransferRecord[]`. Verify chifra param names against the deployed instance during this step.
2. **API route** — `packages/api/src/routes/chifra.ts` exposing `GET /api/chifra/transfers?token=&from=&to=` with Zod validation per the codebase pattern (alerts.ts as reference).
3. **Web cache layer** — `packages/web/src/lib/chartCache.ts` with `getCachedTransfers / setCachedTransfers / evictUntil / evictToken` over raw `IDBDatabase` (no idb-keyval — we need indexes).
4. **Hook** — `useTokenTransfers(token, window)` that returns `{ data, status, source: "cache" | "network" }`. Wraps cache + fetch.
5. **Chart component** — `<TransferCountChart />` — pure SVG, no chart-lib dependency. Bucket aggregation in `useMemo`.
6. **Token detection** — extend ContractView to detect ERC-20 shape and conditionally show the `chart` tab.

Each step ships as its own commit. Step 1 + 2 land first, can be smoke-tested via `curl` against the dev API. The web layers stack on top.

---

## 8. Findings from API probing (2026-05-23)

Spent time probing `chifra.valve.city` to verify the assumptions before
building. **One finding** changes the design materially — and an earlier
version of this section misdiagnosed it. Corrected below.

### Finding — the REST API caps responses at 250 records, no pagination.

Every chifra response (`/list`, `/export`, regardless of mode flags) is
hard-capped at 250 records, and no parameter is accepted that would
paginate past the cap or constrain to a block range. The cap applies
identically to:

- Monitored addresses like HEX (~30M records exist in the underlying
  index; we see the first 250, which is December 2019 activity).
- Unmonitored addresses like wPLS (chifra walks chunks live on cold
  cache — takes ~20s but returns 250 records starting from the address's
  earliest activity).

Probed and rejected as `Invalid key`:

| Family | Rejected keys |
|---|---|
| Page-based | `page`, `per_page`, `limit`, `offset`, `max_records`, `n_records`, `first_record` |
| Range-based | `first_block`, `last_block`, `start_block`, `end_block`, `from_block`, `to_block`, `since`, `until`, `block`, `first`, `last`, `after`, `before`, `blocks` |
| Sort/dir | `reverse`, `sort` |
| Other | `freshen`, `no_header`, `transactions`, `txs`, `tx_ids` |

The only block-position-aware key that's accepted on `/export` is
`appearances`, but it's a **mode flag** (mutually exclusive with
`logs=true` and the other modes) that takes a value list of specific
`block.txid` tuples — not a range.

The underlying chifra/trueblocks CLI **does support** all these flags
(`chifra list --first_block N --last_block M`, `--page`, `--page_size`,
etc.). The REST proxy at `chifra.valve.city` simply doesn't whitelist
them. Filed at `docs/chifra-monitoring-issue.md` for the maintainer.

### What was previously claimed in this section, and why it was wrong

An earlier version of this doc claimed chifra was gating on monitor
membership ("only 2 addresses monitored, every other token returns 0
records"). That was a misread of two signals:

1. The `/monitors` endpoint returns the *monitor cache*, not an
   access-control list. Monitor cache is an optimization for hot
   addresses; chunks contain all chain data.
2. Initial probes against unmonitored tokens timed out at 30s, and I
   treated empty timed-out responses as "0 records". Retrying with a
   180s timeout proved chifra serves any address — just slowly on
   cold cache.

Acknowledging the mistake here so the doc stays load-bearing.

---

## 9. Three forward paths (revised)

The constraint is the 250-record-of-oldest-data ceiling, not monitor
gating. That changes the option space.

### Path A — chifra v0 over the 250-oldest window

Ship the feature against whatever chifra returns today (the first 250
appearances of any token, regardless of recency). Useful as a tech demo
of the pipeline, but the chart shows ancient data — HEX's December
2019, WPLS's deployment week, etc. Not useful as a user feature.

- **Pros:** Lets us build + commit the API service, IDB cache, chart UI
  against a real data source without waiting on the maintainer.
- **Cons:** The chart is misleading. Users will think it's broken.

### Path B — wait for the maintainer to add pagination/range

The fix is small for them (whitelisting existing CLI flags as REST query
params). Once shipped, every token works, recent or historical. Build
in the meantime against a mock or stand still.

- **Pros:** Correct end state, no rework.
- **Cons:** Blocked on external timeline.

### Path C — pivot v0 data source to BlockScout, keep the chifra layer for the future

BlockScout already serves `/api?module=account&action=tokentx&address=`
with cursor pagination and **no monitor requirement**. The IDB cache,
chart UI, storage release pattern, and useTokenTransfers hook design
all stay the same — only the API service swaps.

- **Pros:** Works for every token on day 1, recent data, no maintainer
  dependency. BlockScout is already a configured dependency
  (`BLOCKSCOUT_API_URL` env var, used elsewhere in `services/explorer/`).
- **Cons:** BlockScout's `tokentx` paginates unreliably past page ~50 on
  large addresses. No articulated swap data. Fine for v0 chart use,
  worse than chifra for deep address-history pages.

**Recommendation: Path C for v0 + Path B for v1.** The BlockScout slice
ships in hours and works for everything; switching the API layer
implementation to chifra once the maintainer ships pagination is a
single-file swap. Everything above the API service is reusable.

---

## 10. Pre-build open questions (deferred)

These are downstream and can wait until a path is picked:

- **Bucket granularity rule.** `24h → hourly, 7d → 6h, 30d → daily`?
- **Decimal handling for volume.** Fetch token `decimals()` once and cache
  in IDB alongside the transfers? Or always-render as raw uint?
- **Active-token detection.** Heuristic for "this contract is a token"
  before showing the chart tab — ABI shape, ERC-165, or call `decimals()`
  speculatively?

---

## 9. Decisions explicitly NOT made here

- **Price feeds.** Chifra doesn't have them; integrating a price oracle
  (PulseX subgraph, Dexscreener) is a separate scope.
- **Holders chart.** Punt per `EXPLORER_API_SPEC.md` §2.8 — needs an
  aggregator pass we don't have.
- **Cross-chain.** Single chain (PulseChain) in v1. The `?chain=` param
  on the chifra side is the only chain-aware spot.
