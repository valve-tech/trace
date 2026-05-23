# Issue: chifra.valve.city REST API has no pagination — capped at 250 records per response

> **RESOLVED 2026-05-23 — feature was always there, key naming was wrong.**
>
> The chifra REST proxy accepts pagination + block-range params in
> **camelCase**, not snake_case. The original probes used `first_block`,
> `last_block`, `max_records`, `reverse` — all of which hit the
> "Invalid key" fall-through. The actually-accepted keys are:
>
> | param            | type   | purpose                                       |
> |------------------|--------|-----------------------------------------------|
> | `firstBlock`     | uint64 | First block to include (inclusive)            |
> | `lastBlock`      | uint64 | Last block to include (inclusive)             |
> | `firstRecord`    | uint64 | Skip this many records (offset)               |
> | `maxRecords`     | uint64 | Cap result count (default 250, no upper limit)|
> | `reversed`       | bool   | Return newest-first instead of oldest-first   |
>
> All five work on **both** `/list` and `/export`, on monitored *and*
> unmonitored addresses (the chunk-walking path threads them through too).
> See `chifra/internal/{list,export}/options.go` `*FinishParseInternal` in
> trueblocks-core for the source-of-truth list.
>
> ### Working examples (verified against chifra.valve.city 2026-05-23)
>
> ```bash
> # Latest 50 HEX appearances, newest first
> curl -sS "https://chifra.valve.city/list?chain=pulsechain\
> &addrs=0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39\
> &reversed=true&maxRecords=50"
>
> # Activity for any unmonitored token before block 18,000,000, 100 newest first
> curl -sS "https://chifra.valve.city/list?chain=pulsechain\
> &addrs=0xA1077a294dDE1B09bB078844df40758a5D0f9a27\
> &lastBlock=18000000&reversed=true&maxRecords=100"
>
> # Latest 5 transfer logs for HEX with articulation
> curl -sS "https://chifra.valve.city/export?chain=pulsechain\
> &addrs=0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39\
> &logs=true&articulate=true&reversed=true&maxRecords=5"
> ```
>
> ### Pagination recipe (block-range as cursor)
>
> For chronological feeds, the cleanest cursor is the last block-number
> seen — no opaque tokens needed:
>
> 1. **First page (newest)**: `?reversed=true&maxRecords=N`
> 2. **Next page**: take `data[N-1].blockNumber` from the prior response,
>    request `?reversed=true&maxRecords=N&lastBlock=<that_block - 1>`
> 3. Repeat until the response is short of `N`
>
> `firstRecord`-based offset pagination also works but is more fragile
> across new appearances arriving at tip — block-range is recommended.
>
> ### Block-time bucketing for charting
>
> For `docs/CHARTING.md` time-series, convert your wall-clock range to a
> block-number range (use chifra `/when?timestamps=...` or any block-time
> lookup), then loop `firstBlock`/`lastBlock` per bucket. Each bucket
> stays under 250 records for high-activity tokens by using `maxRecords`
> as a sanity ceiling.
>
> ---
>
> *(Original issue text retained below for context. The "Suggested next
> steps" section is no longer applicable — the keys were always there.)*



## Summary

The chifra REST instance at `https://chifra.valve.city` (PulseChain
endpoint, `?chain=pulsechain`) **returns at most 250 records per call**
and accepts **no parameter to paginate or to filter by block range**.

This is independent of whether an address is in the monitor cache —
both monitored addresses (HEX) and unmonitored addresses (every other
PulseChain token) return the same 250-record cap, just at very
different latencies (~1s monitored, ~20s+ unmonitored cold-cache).

Since chifra's natural ordering is oldest-first, the 250 records you
get are the *first* 250 appearances of the address — for HEX, that's
December 2019. For any present-day analytics (charting, recent
activity feeds, address transaction history pages), this is the wrong
end of the timeline.

The underlying data is present — the chunks endpoint confirms the
PulseChain index is fully populated and chifra can serve any address.
It's the REST API surface that's missing the controls.

## Reproduction

All requests below issued 2026-05-23 against the public endpoint.
Responses trimmed.

### 1. The 250-record cap applies to every address.

**HEX (monitored):**

```bash
curl -sS "https://chifra.valve.city/list?addrs=0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39&chain=pulsechain"
# → 250 records, blocks 9041184–9041988 (December 2019, oldest activity)
```

```bash
curl -sS "https://chifra.valve.city/export?addrs=0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39&chain=pulsechain&logs=true"
# → 250 records, same range
```

The `/monitors?list=true` endpoint reports HEX has `nRecords:
29,656,291`. We're seeing 0.00084% of those.

**Wrapped PLS, `0xA1077a294dDE1B09bB078844df40758a5D0f9a27` (unmonitored):**

```bash
time curl -sS "https://chifra.valve.city/list?addrs=0xA1077a294dDE1B09bB078844df40758a5D0f9a27&chain=pulsechain"
# real 0m23s
# → 250 records, starting at block 17235538 (post-fork WPLS deployment),
#   stopping ~250 appearances in.
```

Same cap, applies to chunk-walked addresses too — confirming the limit
is at the REST layer, not the monitor cache.

### 2. No pagination parameter is accepted on `/list` or `/export`.

Probed every common pagination key, all rejected with `Invalid key
(<key>) in list route`:

```
page, per_page, limit, offset, max_records, first_record, last,
n_records, reverse, sort, freshen
```

Probed every common block-range key on `/export`, all rejected:

```
first_block, last_block, start_block, end_block, from_block, to_block,
since, until, block, first, last, after, before, blocks, blockRange,
block_range, transactions, txs, tx_ids
```

The only block-position-aware key that wasn't rejected outright is
`appearances` — but it's a **mode flag** for `/export`, mutually
exclusive with `logs=true` / `receipts=true` / etc., and it accepts a
value list of `block.txid` tuples (specific appearances), not ranges.

### 3. The chunks endpoint confirms the underlying index is complete.

```bash
curl -sS "https://chifra.valve.city/chunks?chain=pulsechain&mode=stats"
# → returns per-chunk stats covering the full chain range; ratios sane,
#   no gaps. The data is present in the chunks; the REST API is what
#   doesn't expose it.
```

### 4. Status confirms the upstream is healthy.

```bash
curl -sS "https://chifra.valve.city/status?chain=pulsechain"
# → trueblocks 6.5.0, reth v2.2.0-pulse, archive + tracing,
#   client block 26603856, finalized 26601290 — fully synced.
```

## Expected behavior

For per-address history endpoints to be usable, the REST API needs
**at least one** of:

1. **Page-based pagination** — accept `&page=N` and either return a
   `meta.pagination` block with `total` and `nextPage`, or return a
   `Link: ...; rel="next"` header. Page size could remain 250 by
   default, optionally tunable via `&page_size=N` up to some cap.

2. **Cursor pagination** — accept `&cursor=<opaque>` whose value
   encodes the last returned `(blockNumber, transactionIndex)`. Cleaner
   for natural-order traversal, no off-by-one on inserts.

3. **Block-range filtering** — accept `&first_block=N&last_block=M`.
   The underlying CLI (`chifra list --first_block X --last_block Y`)
   already supports this — the REST proxy just needs to whitelist the
   keys.

Any one of these unblocks the use case. Cursor pagination is the most
flexible; block-range is the most natural fit for our charting work.

A `&reverse=true` (or default-reverse-on-no-cursor) option would also
be valuable — almost every present-day-analytics use case wants the
*newest* 250, not the oldest 250.

## Impact

This blocks the following features in `valve-tech/trace`:

1. **Per-address transaction history pagination** — Bundle 3 in our
   `docs/EXPLORER_API_SPEC.md` (§2.5 and §2.6). chifra is the only
   address-history pagination source we can rely on (Reth's
   `ots_searchTransactionsBefore/After` are stubbed `unimplemented`,
   per §4a of the same doc). Without pagination from chifra, the
   address page can only show the 250 oldest entries for any
   high-activity address.

2. **Token transfer feeds** (§2.6) — same dependency.

3. **Per-token charting** (`docs/CHARTING.md`) — time-series of
   transfers / volume requires recent data. The 250-record cap
   currently returns only ancient data for any non-trivial token.

## Suggested next steps for the maintainer

Pick whichever fits your operational model best:

### Option 1 — Whitelist the existing CLI flags as REST query params

The trueblocks-core REST proxy generates routes from the CLI command
schemas. If `--first_block` / `--last_block` / `--page` / `--per_page`
are valid flags on `chifra list` and `chifra export` (they are, at the
CLI), the REST proxy just needs them added to the accepted-keys list
for those routes.

This is the smallest change and the most likely to land cleanly.

### Option 2 — Implement cursor pagination at the REST proxy level

Return a `meta.cursor` token in every response that encodes the last
returned position. Accept `&cursor=<token>` to continue. Doesn't
require any CLI changes — purely a proxy enhancement.

### Option 3 — Add a `&reverse=true` mode

Even without pagination, returning the *latest* 250 instead of the
*earliest* 250 would make the API immediately useful for recent
activity. Acceptable as a stopgap.

## What we'll do on our side

- Cache chifra responses aggressively in our API layer so we don't
  spam your instance once pagination/range is in place. We're already
  using a 1h TTL + 500-entry FIFO cache pattern for ABI lookups; the
  same pattern will apply.
- We can supply a list of high-traffic PulseChain addresses if it
  helps prioritize what to add to the monitor cache for the
  speed-sensitive interactive endpoints.

## Environment

- Endpoint: `https://chifra.valve.city`
- Chain: `pulsechain` (chainId 369)
- trueblocks version (per `/status`): `GHC-TrueBlocks//6.5.0`
- Reth client: `reth/v2.2.0-pulse-228bdae`
- Probe date: 2026-05-23
- Probed from: `valve-tech/trace` development environment
