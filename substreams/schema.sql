-- Postgres schema for substreams-sink-sql. The sink also creates its own
-- bookkeeping tables (cursors) via `substreams-sink-sql setup`.
--
-- token_balance: (token, holder) -> current raw balance (smallest unit).
-- token + holder are lowercase 0x-less hex (matching the substreams keys).
-- The API formats by decimals (from the curated chain registry) and filters
-- balance > 0; symbol/name come from the registry, not stored here.

create table if not exists token_balance (
    token   text   not null,
    holder  text   not null,
    balance numeric not null default 0,
    primary key (token, holder)
);

create index if not exists idx_token_balance_holder on token_balance (holder);
