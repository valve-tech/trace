import { formatEther } from "viem";

/**
 * Pure row mapper for the Blockscout `txlistinternal` payload. Extracted
 * from internalTransactions.ts so the defensive defaults
 * (`value || "0"`, `type || "CALL"`, `errCode || ""`, `isError || "0"`)
 * are testable without mocking blockscoutFetch.
 *
 * Same shape as the other Blockscout row mappers in this directory
 * (addresses, contracts, tokenTransfers) — Blockscout sends empty
 * strings or missing fields on partial successes and the API layer
 * coerces them to sensible defaults so the consumer can render
 * without null-checking every field.
 */

export interface BlockscoutInternalTxRow {
  from: string;
  to: string;
  value: string;
  type: string;
  gas: string;
  gasUsed: string;
  input: string;
  errCode: string;
  isError: string;
}

export interface InternalTransactionView {
  from: string;
  to: string;
  value: string;
  valuePLS: string;
  type: string;
  gas: string;
  gasUsed: string;
  input: string;
  errCode: string;
  isError: string;
}

/**
 * Map a Blockscout internal-tx row into the canonical API view shape.
 *
 * Defaults:
 *   - empty `value` → "0" wei (so `valuePLS` formats as "0" not throws)
 *   - empty `type` → "CALL" (the default opcode kind for the legacy
 *     internal-tx endpoint when Blockscout couldn't determine the
 *     exact opcode)
 *   - empty `errCode` → "" (consumers test it with `!== ""`)
 *   - empty `isError` → "0" (Blockscout's 0/1 boolean encoding)
 */
export function mapInternalTxRow(
  row: BlockscoutInternalTxRow,
): InternalTransactionView {
  return {
    from: row.from,
    to: row.to,
    value: row.value,
    valuePLS: formatEther(BigInt(row.value || "0")),
    type: row.type || "CALL",
    gas: row.gas,
    gasUsed: row.gasUsed,
    input: row.input,
    errCode: row.errCode || "",
    isError: row.isError || "0",
  };
}
