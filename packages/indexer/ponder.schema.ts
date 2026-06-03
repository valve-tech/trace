import { onchainTable, primaryKey } from "ponder";

/**
 * tokenBalance — the (holder, token) → current balance projection the
 * portfolio reads. `balance` is the raw integer (smallest unit); the API
 * formats by the token's decimals. `updatedBlock` aids debugging + a future
 * "as of block N" query.
 */
export const tokenBalance = onchainTable(
  "token_balance",
  (t) => ({
    holder: t.hex().notNull(),
    token: t.hex().notNull(),
    balance: t.bigint().notNull(),
    updatedBlock: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.holder, table.token] }),
  }),
);

/**
 * tokenMeta — symbol/name/decimals per curated token, written once on first
 * sight. Lets the API return human labels without its own metadata lookup.
 */
export const tokenMeta = onchainTable("token_meta", (t) => ({
  token: t.hex().primaryKey(),
  symbol: t.text().notNull(),
  name: t.text().notNull(),
  decimals: t.integer().notNull(),
}));
