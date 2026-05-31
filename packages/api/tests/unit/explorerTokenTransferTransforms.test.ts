import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapV1Row,
  mapV2Row,
  safeFormatUnits,
  type BlockscoutV1Row,
  type BlockscoutV2Row,
} from "../../src/services/explorer/tokenTransfers/transforms.js";

/**
 * Unit tests for the token-transfer row mappers + safeFormatUnits.
 * Two upstream shapes (v2 nested, v1 flat) flatten to the same view —
 * tests pin down that both produce identical output for equivalent
 * input.
 */

describe("safeFormatUnits", () => {
  it("formats 1 wei with 0 decimals as '1'", () => {
    assert.equal(safeFormatUnits("1", "0"), "1");
  });

  it("formats 1e18 with 18 decimals as '1'", () => {
    assert.equal(safeFormatUnits("1000000000000000000", "18"), "1");
  });

  it("formats 1e6 with 6 decimals (USDC-like) as '1'", () => {
    assert.equal(safeFormatUnits("1000000", "6"), "1");
  });

  it("defaults decimals to 18 when decimalsStr is undefined", () => {
    assert.equal(safeFormatUnits("1000000000000000000", undefined), "1");
  });

  it("defaults decimals to 18 when decimalsStr is empty", () => {
    assert.equal(safeFormatUnits("1000000000000000000", ""), "1");
  });

  it("treats an empty value as zero", () => {
    assert.equal(safeFormatUnits("", "18"), "0");
  });

  it("returns the raw value string on a malformed BigInt (defensive)", () => {
    assert.equal(safeFormatUnits("not-a-number", "18"), "not-a-number");
  });

  it("handles values larger than Number.MAX_SAFE_INTEGER via BigInt", () => {
    // 1e24 with 18 decimals = 1,000,000
    assert.equal(safeFormatUnits("1000000000000000000000000", "18"), "1000000");
  });
});

describe("mapV2Row", () => {
  function v2(overrides: Partial<BlockscoutV2Row> = {}): BlockscoutV2Row {
    return {
      from: { hash: "0xfrom" },
      to: { hash: "0xto" },
      total: { value: "1000000000000000000", decimals: "18" },
      token: {
        name: "Wrapped PLS",
        symbol: "WPLS",
        address: "0xtoken",
        decimals: "18",
      },
      ...overrides,
    };
  }

  it("flattens the nested v2 shape into the canonical view", () => {
    const out = mapV2Row(v2(), "0xtx");
    assert.deepEqual(out, {
      from: "0xfrom",
      to: "0xto",
      value: "1000000000000000000",
      formattedValue: "1",
      tokenName: "Wrapped PLS",
      tokenSymbol: "WPLS",
      tokenDecimal: "18",
      contractAddress: "0xtoken",
      hash: "0xtx",
    });
  });

  it("uses the caller-supplied hash (v2 row doesn't carry its own)", () => {
    const out = mapV2Row(v2(), "0xCAFEBABE");
    assert.equal(out.hash, "0xCAFEBABE");
  });

  it("uses token.decimals (not total.decimals) for formatting", () => {
    // Documents the choice — both fields exist in v2; the formatter
    // uses the token-level decimals, which matches the ERC-20 contract
    // configuration.
    const out = mapV2Row(
      v2({
        total: { value: "1000000", decimals: "0" },
        token: {
          name: "USDC",
          symbol: "USDC",
          address: "0xusdc",
          decimals: "6",
        },
      }),
      "0xtx",
    );
    assert.equal(out.formattedValue, "1"); // 1e6 / 1e6 = 1
  });
});

describe("mapV1Row", () => {
  function v1(overrides: Partial<BlockscoutV1Row> = {}): BlockscoutV1Row {
    return {
      from: "0xfrom",
      to: "0xto",
      value: "1000000000000000000",
      tokenName: "Wrapped PLS",
      tokenSymbol: "WPLS",
      tokenDecimal: "18",
      contractAddress: "0xtoken",
      hash: "0xtx",
      ...overrides,
    };
  }

  it("passes through every field, formatting value via safeFormatUnits", () => {
    const out = mapV1Row(v1());
    assert.deepEqual(out, {
      from: "0xfrom",
      to: "0xto",
      value: "1000000000000000000",
      formattedValue: "1",
      tokenName: "Wrapped PLS",
      tokenSymbol: "WPLS",
      tokenDecimal: "18",
      contractAddress: "0xtoken",
      hash: "0xtx",
    });
  });

  it("v1 and v2 mappers produce identical output for equivalent input", () => {
    const v1Out = mapV1Row(v1());
    const v2Out = mapV2Row(
      {
        from: { hash: "0xfrom" },
        to: { hash: "0xto" },
        total: { value: "1000000000000000000", decimals: "18" },
        token: {
          name: "Wrapped PLS",
          symbol: "WPLS",
          address: "0xtoken",
          decimals: "18",
        },
      },
      "0xtx",
    );
    assert.deepEqual(v1Out, v2Out);
  });
});
