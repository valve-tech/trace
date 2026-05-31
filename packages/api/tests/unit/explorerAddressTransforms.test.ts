import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractTxTypeAndFees,
  LEGACY_FALLBACK_FEES,
  mapTokenRow,
  mapTxListRow,
  type BlockscoutTokenRow,
  type BlockscoutTxListRow,
} from "../../src/services/explorer/addresses/transforms.js";

/**
 * Unit tests for the pure Blockscout-row → API-view transforms. The
 * defensive defaults are the critical surface — Blockscout occasionally
 * returns empty strings for `value`, missing `decimals`, or a tx type
 * that doesn't match an EIP-2718 spec, and the API has to render
 * something sensible in each case.
 */

function row(overrides: Partial<BlockscoutTxListRow> = {}): BlockscoutTxListRow {
  return {
    hash: "0x" + "a".repeat(64),
    blockNumber: "12345",
    timeStamp: "1700000000",
    from: "0x" + "1".repeat(40),
    to: "0x" + "2".repeat(40),
    value: "0",
    gas: "21000",
    gasUsed: "21000",
    gasPrice: "1000000000",
    isError: "0",
    functionName: "",
    methodId: "0x",
    input: "0x",
    ...overrides,
  };
}

function tokenRow(
  overrides: Partial<BlockscoutTokenRow> = {},
): BlockscoutTokenRow {
  return {
    balance: "0",
    contractAddress: "0x" + "c".repeat(40),
    name: "Token",
    symbol: "TKN",
    decimals: "18",
    type: "ERC-20",
    ...overrides,
  };
}

describe("mapTxListRow", () => {
  it("formats a 1-PLS value as '1' in valuePLS", () => {
    const out = mapTxListRow(row({ value: "1000000000000000000" }));
    assert.equal(out.valuePLS, "1");
    assert.equal(out.value, "1000000000000000000"); // raw preserved
  });

  it("treats an empty 'value' as zero wei (Blockscout occasionally omits it)", () => {
    const out = mapTxListRow(row({ value: "" }));
    assert.equal(out.valuePLS, "0");
  });

  it("preserves an explicit '0' value", () => {
    const out = mapTxListRow(row({ value: "0" }));
    assert.equal(out.valuePLS, "0");
  });

  it("empty functionName / methodId default to empty strings, not undefined", () => {
    const out = mapTxListRow(row({ functionName: "", methodId: "" }));
    assert.equal(out.functionName, "");
    assert.equal(out.methodId, "");
  });

  it("copies hash / from / to / input through verbatim", () => {
    const out = mapTxListRow(
      row({
        hash: "0xdead",
        from: "0xaaa",
        to: "0xbbb",
        input: "0xcafebabe",
      }),
    );
    assert.equal(out.hash, "0xdead");
    assert.equal(out.from, "0xaaa");
    assert.equal(out.to, "0xbbb");
    assert.equal(out.input, "0xcafebabe");
  });

  it("handles a wei value larger than Number.MAX_SAFE_INTEGER via BigInt", () => {
    const wei = "1000000000000000000000000"; // 1M PLS
    const out = mapTxListRow(row({ value: wei }));
    assert.equal(out.valuePLS, "1000000");
  });
});

describe("mapTokenRow", () => {
  it("formats balance using the row's decimals", () => {
    const out = mapTokenRow(
      tokenRow({ balance: "1000000", decimals: "6" /* USDC-like */ }),
    );
    assert.equal(out.formattedBalance, "1"); // 1e6 with 6 decimals
  });

  it("defaults decimals to 18 when the row's decimals field is empty", () => {
    const out = mapTokenRow(tokenRow({ balance: "1000000000000000000", decimals: "" }));
    assert.equal(out.formattedBalance, "1"); // assumes 18
  });

  it("keeps the raw balance string when balance is non-numeric (defensive)", () => {
    const out = mapTokenRow(tokenRow({ balance: "not-a-number" }));
    assert.equal(out.formattedBalance, "not-a-number");
  });

  it("empty balance is treated as zero", () => {
    const out = mapTokenRow(tokenRow({ balance: "" }));
    assert.equal(out.formattedBalance, "0");
  });

  it("type defaults to 'ERC-20' when missing", () => {
    const out = mapTokenRow(tokenRow({ type: "" }));
    assert.equal(out.type, "ERC-20");
  });

  it("preserves an explicit ERC-721 type", () => {
    const out = mapTokenRow(tokenRow({ type: "ERC-721" }));
    assert.equal(out.type, "ERC-721");
  });

  it("name / symbol / contractAddress / decimals copy through verbatim", () => {
    const out = mapTokenRow(
      tokenRow({
        name: "Wrapped PLS",
        symbol: "WPLS",
        contractAddress: "0xfeed",
        decimals: "18",
      }),
    );
    assert.equal(out.name, "Wrapped PLS");
    assert.equal(out.symbol, "WPLS");
    assert.equal(out.contractAddress, "0xfeed");
    assert.equal(out.decimals, "18");
  });
});

describe("extractTxTypeAndFees", () => {
  it("extracts EIP-1559 fees and tx type as strings", () => {
    const out = extractTxTypeAndFees({
      type: "eip1559",
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    });
    assert.equal(out.type, "eip1559");
    assert.equal(out.maxFeePerGas, "2000000000");
    assert.equal(out.maxPriorityFeePerGas, "1000000000");
  });

  it("falls back to 'legacy' when the tx has no type field", () => {
    const out = extractTxTypeAndFees({});
    assert.equal(out.type, "legacy");
    assert.equal(out.maxFeePerGas, null);
    assert.equal(out.maxPriorityFeePerGas, null);
  });

  it("renders nulls for the fee fields when only one is missing", () => {
    const out = extractTxTypeAndFees({
      type: "eip1559",
      maxFeePerGas: 5_000_000_000n,
      // maxPriorityFeePerGas omitted
    });
    assert.equal(out.maxFeePerGas, "5000000000");
    assert.equal(out.maxPriorityFeePerGas, null);
  });

  it("handles a zero-bigint fee correctly (not treated as nullish)", () => {
    const out = extractTxTypeAndFees({
      type: "eip2930",
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
    });
    assert.equal(out.maxFeePerGas, "0");
    assert.equal(out.maxPriorityFeePerGas, "0");
  });

  it("preserves explicit 'eip2930' / 'eip4844' / 'eip7702' tx types", () => {
    for (const t of ["eip2930", "eip4844", "eip7702"]) {
      const out = extractTxTypeAndFees({ type: t });
      assert.equal(out.type, t);
    }
  });
});

describe("LEGACY_FALLBACK_FEES", () => {
  it("is the canonical fee-shape used when getTransaction throws", () => {
    assert.deepEqual(LEGACY_FALLBACK_FEES, {
      type: "legacy",
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    });
  });
});
