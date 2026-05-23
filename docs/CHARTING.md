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

> **IMPLEMENTED (2026-05-23):** The live chart path is **client-side
> `eth_getLogs` via the `/rpc` proxy**, NOT chifra. Reth answers
> block-ranged log queries in milliseconds; chifra's appearance index is
> genesis-forward ordered and times out (>90s) on recent slices of
> high-activity tokens like HEX. The chifra API service
> (`services/chifra/`, `routes/chifra.ts`) is built and works for
> low/mid-activity tokens — it's **reserved for a future "all-time from
> genesis" view**, not the recent-window chart. See §8–9.
>
> Implemented flow:
> ```
> browser: useTokenTransfers(token)
>   → getHeadBlock() + grid-aligned 2000-block batches over last 3 days
>   → for each batch: IndexedDB hit, else eth_getLogs(token,[Transfer]) via /rpc
>   → sealed batches cached; head batch always re-fetched
>   → flat() → client-side bucket by block → SVG bars
>   → "Load more" extends the window backward, reuses cached cells
> ```

The original chifra-proxy design (below) is retained for the all-time view.

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

Chifra's `/export` and `/list` accept block ranges as **camelCase**
query params: `firstBlock`, `lastBlock`, `firstRecord`, `maxRecords`,
`reversed` (verified against the live endpoint 2026-05-23). The
earlier "rejected" findings used snake_case; that's why every probe
hit "Invalid key" — the trueblocks-core route parser only knows the
camelCase forms. Source of truth:
`chifra/internal/{list,export}/options.go` `*FinishParseInternal`.

Working pattern for charting buckets:

```http
GET /export?chain=pulsechain&addrs=<token>&logs=true
           &firstBlock=<bucket_start>&lastBlock=<bucket_end>
           &reversed=true&maxRecords=10000
```

Pick `maxRecords` large enough that no single bucket overflows it
(PulseX Router will need either small buckets or `firstRecord`-based
follow-up pagination within a bucket).

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

Spent time probing `chifra.valve.city` to verify assumptions before
building. **Net result: chifra does everything the feature needs** —
block-range filtering, reverse ordering, and arbitrary record counts
for any token, monitored or not. Two earlier misdiagnoses in this
section (since corrected) are documented at the end so the doc stays
honest.

### Finding — chifra is fully capable; params are camelCase.

Verified live against HEX (`0x2b59...`):

```http
GET /list?chain=pulsechain&addrs=<token>&firstBlock=26000000&lastBlock=26010000
  → records within that range (recent, May 2026)

GET /list?chain=pulsechain&addrs=<token>&reversed=true&maxRecords=2000
  → the 2000 most-recent records (blocks 26603641..26604944)
```

The default page size is 250; `maxRecords` overrides it. Unmonitored
addresses work too — chifra walks chunks live (~20s cold) and returns
the same range/reverse/count controls. No monitor membership required,
no maintainer dependency, no data-source pivot.

**Accepted (camelCase) keys** — verified live 2026-05-23:

| Family | Accepted keys |
|---|---|
| Pagination | `firstRecord`, `maxRecords` |
| Range | `firstBlock`, `lastBlock` |
| Sort | `reversed` (boolean) |

**Rejected (snake_case) keys** — these all hit "Invalid key" because
the route parser only knows the camelCase forms above:

| Family | Rejected keys (do NOT use) |
|---|---|
| Page-based | `page`, `per_page`, `limit`, `offset`, `max_records`, `n_records`, `first_record` |
| Range-based | `first_block`, `last_block`, `start_block`, `end_block`, `from_block`, `to_block`, `since`, `until`, `block`, `first`, `last`, `after`, `before`, `blocks` |
| Sort/dir | `reverse`, `sort` |
| Other | `freshen`, `no_header`, `transactions`, `txs`, `tx_ids` |

The `appearances` key on `/export` is a **mode flag** (mutually
exclusive with `logs=true`), taking a value list of `block.txid`
tuples — useful when you already know the exact appearances to fetch,
not a substitute for `firstBlock`/`lastBlock`.

### What was previously claimed in this section, and why it was wrong

An earlier version of this doc claimed chifra was gating on monitor
membership ("only 2 addresses monitored, every other token returns 0
records"). That was a misread of two signals:

1. The `/monitors` endpoint returns the *monitor cache*, not an
   access-control list. Monitor cache is an optimization for hot
   addresses; chunks contain all chain data, queryable for any address.
2. Initial probes against unmonitored tokens timed out at 30s, and I
   treated empty timed-out responses as "0 records". Retrying with a
   180s timeout proved chifra serves any address — just slowly on
   cold cache.
3. Block-range and pagination params were probed in snake_case
   (`first_block`, `last_block`, `max_records`, `reverse`), which the
   route parser rejects. The accepted keys are camelCase
   (`firstBlock`, `lastBlock`, `maxRecords`, `reversed`). The REST
   proxy was never the problem; the keys were always available — I was
   sending the wrong case.

No maintainer fix is needed and there is no BlockScout fallback. The
feature builds directly on chifra as originally designed.

Acknowledging the mistakes here so the doc stays load-bearing.

---

## 9. Build plan — chifra, recent-first

No forward-path decision needed; chifra is the source. The query
pattern for charting buckets:

```http
GET /api/chifra/transfers?token=<addr>&window=24h
  → API translates window to a block range, calls chifra:
    /list?chain=pulsechain&addrs=<addr>&firstBlock=<N>&lastBlock=<head>
          &reversed=true&maxRecords=<cap>
  → normalizes to TransferRecord[] (§4), returns to web
```

Window → block-range translation lives in the API service: PulseChain
is ~10s/block, so `24h ≈ 8,640 blocks`, `7d ≈ 60,480`, `30d ≈ 259,200`.
Compute `firstBlock = head - windowBlocks`, fetch head from the existing
viem client.

`maxRecords` caps the pull. For high-activity tokens a single window
may exceed it; the API can detect `records.length === maxRecords`
(likely truncated) and surface a `truncated: true` flag the chart shows
as a "showing most recent N" note. Deeper history within a window uses
`firstRecord` to paginate — deferred until a real token needs it.

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
