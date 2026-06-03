# valve-holdings substreams

Holder balances for a curated PulseChain token set, streamed from the Valve
firehose and sunk to Postgres via `substreams-sink-sql`. This is the
**real** holdings data layer (replacing the chifra path); see
`docs/superpowers/specs/2026-06-02-portfolio-holdings-data-layer-design.md`.

## How it works

- `store_balances` (store, `add` bigint) — accumulates signed ERC-20
  `Transfer` deltas keyed by `token:holder` for the curated set in
  [`src/lib.rs`](./src/lib.rs). The store holds **current balances**, bounded
  by holder count — so a genesis backfill stays small (no per-transfer rows).
- `db_out` (map → `DatabaseChanges`) — turns each per-block balance delta into
  a Postgres upsert on `token_balance`.

Curated tokens (verified on-chain 2026-06-02): WPLS, HEX (8 decimals), PLSX,
INC. Extend the `CURATED` array in `src/lib.rs` (and the API's curated list)
deliberately — each high-volume token adds holder rows.

## Build

```bash
rustup target add wasm32-unknown-unknown   # once
cargo build --target wasm32-unknown-unknown --release
substreams pack substreams.yaml            # → valve-holdings-v0.1.0.spkg
substreams info valve-holdings-v0.1.0.spkg
```

## Run the sink (once the endpoint streams)

Auth is a **long-lived bearer token** — the Valve key (no JWT; see the spec).
The substreams CLI/sink reads `SUBSTREAMS_API_TOKEN`.

```bash
export SUBSTREAMS_API_TOKEN=<valve-key>
DSN="psql://valvetech:valvetech@localhost:5432/valvetech?sslmode=disable"
EP=evm-943-substreams.valve.city:443

# one-time: create token_balance + the sink's cursor tables
substreams-sink-sql setup "$DSN" valve-holdings-v0.1.0.spkg

# stream from genesis, upserting balances
substreams-sink-sql run "$DSN" valve-holdings-v0.1.0.spkg -e "$EP"
```

The API's `getHoldings` reads `token_balance` (joined with curated metadata
from the chain registry) + a `balanceOf` fallback.

## ⚠️ Blocked on the edge (not this package)

`substreams run`/`run` currently fails with
`Decompressor is not installed for grpc-encoding "s2"` — the firehose
`s2`-compresses streaming responses and Cloudflare mangles it (unary RPCs work,
streaming doesn't). Fix is edge-side: bypass Cloudflare for the substreams host
(grey-cloud / direct origin) or disable `s2`. The package itself is complete and
packs cleanly.
