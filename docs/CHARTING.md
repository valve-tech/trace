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

Spent ~30 min probing `chifra.valve.city` to verify the assumptions in this
doc before building. Two findings change the design materially:

### Finding 1 — `/export` has no block-range param.

All of these were rejected as `Invalid key` by chifra's REST surface:
`first_block`, `last_block`, `start_block`, `end_block`, `from_block`,
`to_block`, `blockRange`, `block_range`, `since`, `until`, `block`,
`first`, `last`, `after`, `before`, `blocks`, `transactions`, `txs`.

The only block-position-aware key the route accepts is `appearances`,
but it's a **mode flag** (mutually exclusive with `logs=true`), not a
filter — and it accepts a value list of `block.txid` tuples, not ranges.

**Implication:** time-windowed charts must either (a) pull the full token
history and slice in the API proxy, or (b) build a two-step pipeline:
`/list` → filter appearances by `blockNumber` → `/export` with those
specific appearances → hydrated logs. Path (b) is correct but costlier.

### Finding 2 — chifra only indexes monitored addresses, and PulseChain has only 2.

```bash
GET /monitors?chain=pulsechain&list=true
→ data: [
    { address: 0x2b591e99afe9f32eaa6214f7b7629768c40eeb39,  # HEX
      fileSize: 237_250_336, nRecords: 29_656_291 },
    { address: 0xa420d10592e85c40008719a4a750a47f4d13dad0,  # ~empty
      fileSize: 80,          nRecords: 9 },
  ]
```

Only **HEX** is fully indexed. Every other token (WPLS, PLSX, INC, IPSE,
all the long-tail) returns 0 records on `/export?addrs=<token>&logs=true`
because chifra has never walked their address.

**This is a deployment-scope problem, not a code problem.** Adding a new
monitored address requires `chifra monitor --addrs <X>` on the server —
which is slow (must walk the index from genesis, ~hours for high-activity
tokens), takes disk space (HEX alone is 237MB), and isn't exposed
through the public REST surface.

---

## 9. Three forward paths

Pick ONE before continuing the build.

### Path A — chifra-only, gated to monitored tokens

Ship the feature with a hard restriction: charts only work for tokens
chifra is currently monitoring. For any other token, the chart tab shows
*"Not indexed yet — request indexing in #valve-ops"* (or equivalent).

- **Pros:** Honest about the dependency. Cheapest to build. The architecture
  in this doc still applies as written.
- **Cons:** Useless for almost every token until ops triages each
  manually. UX is "click button → never works."

### Path B — chifra + monitor-on-demand backend

Build a server-side endpoint that adds a monitor request on first access
to an unmonitored token, then polls until the monitor is ready (or
returns a job ID for async pickup). Token shows
*"Indexing... ~5 min for low-activity, hours for high"* placeholder.

- **Pros:** Self-serve. Eventually works for every token.
- **Cons:** Need server-side write access to chifra config. Job tracking.
  Index disk cost grows with monitored set (HEX = 237MB; PulseX would be
  GBs). Cold-start UX is bad.

### Path C — pivot data source to BlockScout, keep chifra for HEX

BlockScout already serves `tokentx` per-address with cursor pagination —
no monitoring requirement, works for every contract. The IDB cache
layer in this doc applies unchanged; only the API service swaps.

- **Pros:** Works for every token on day 1. BlockScout is already a
  configured dependency (`BLOCKSCOUT_API_URL` env var).
- **Cons:** BlockScout's `tokentx` paginates poorly past page ~50 — high
  activity charts may run out of history. No articulated swap data
  (just raw transfers). Falls back gracefully to "best effort" though.

**Recommendation:** Path C (BlockScout) for v1, layer chifra back in
later for HEX-quality depth on tokens worth monitoring. The IDB cache,
the chart UI, and the storage release pattern are all reusable across
data sources.

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
