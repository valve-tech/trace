-- Postgres schema for substreams-sink-sql (943 prototype). The sink also
-- creates its own bookkeeping tables (cursors, substreams_history) via
-- `substreams-sink-sql setup`.
--
-- transfers: append-only ERC-20 Transfer archive (all tokens, no curation).
--   id        = "{block_num}-{log_index}" (unique within the chain)
--   token / sender / recipient = lowercase hex, no 0x (substreams key form)
--   value     = raw transfer amount (smallest unit), as numeric
--
-- Portfolio discovery is a projection of this table — the set of tokens a
-- wallet has touched: DISTINCT token WHERE sender = $holder OR recipient =
-- $holder. The indexes below make that lookup cheap on Postgres for the small
-- 943 dataset. At mainnet scale this becomes ClickHouse with an insert-time
-- (holder, token) materialized view instead of these btree indexes.
--
-- Current balances are NOT derived from these rows — the API reads balanceOf()
-- at query time, since transfer-sum is wrong for rebasing / fee-on-transfer
-- tokens.

create table if not exists transfers (
    id        text    primary key,
    block_num bigint  not null,
    log_index integer not null,
    token     text    not null,
    sender    text    not null,
    recipient text    not null,
    value     numeric not null default 0
);

create index if not exists idx_transfers_sender    on transfers (sender);
create index if not exists idx_transfers_recipient on transfers (recipient);
create index if not exists idx_transfers_token     on transfers (token);
