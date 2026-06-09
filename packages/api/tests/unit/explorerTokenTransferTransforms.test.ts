import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapV1Row,
  mapV2Row,
  type BlockscoutV1Row,
  type BlockscoutV2Row,
} from "../../src/services/explorer/tokenTransfers/transforms.js";

/**
 * Unit tests for the token-transfer row mappers. Two upstream shapes (v2
 * nested, v1 flat) flatten to the same view, which carries the RAW integer
 * `value` + `tokenDecimal` — no pre-scaled `formattedValue` (scaling is a
 * render-edge concern). Tests pin down that both shapes produce identical,
 * unmutated output for equivalent input.
 */

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

  it("carries the raw value + token-level decimals, unscaled", () => {
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
    // The view reflects chain data verbatim — raw value + the token's decimals.
    assert.equal(out.value, "1000000");
    assert.equal(out.tokenDecimal, "6");
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

  it("passes through every field verbatim (raw value, no scaling)", () => {
    const out = mapV1Row(v1());
    assert.deepEqual(out, {
      from: "0xfrom",
      to: "0xto",
      value: "1000000000000000000",
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
