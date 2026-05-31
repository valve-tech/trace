import { describe, it, expect } from "vitest";
import {
  ALL_CHAINS,
  CHAINS,
  chainById,
  chainLogoUrl,
} from "../lib/chains";

/**
 * Unit tests for the UI-side chain registry. The launch set mirrors the
 * 2026-05-29 multichain spec: chains 1 (Ethereum), 369 (PulseChain), 943
 * (PulseChain Testnet). Tests pin the contract so a regression (wrong
 * id, missing logo URL, ALL_CHAINS colliding with a real id) is loud.
 */

describe("CHAINS registry", () => {
  it("includes the three launch-set chains from the spec", () => {
    const ids = CHAINS.map((c) => c.id).sort();
    expect(ids).toEqual([1, 369, 943]);
  });

  it("every entry has the load-bearing fields populated", () => {
    for (const c of CHAINS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.slug.length).toBeGreaterThan(0);
      expect(c.symbol.length).toBeGreaterThan(0);
      expect(typeof c.testnet).toBe("boolean");
    }
  });

  it("slugs are unique (used as URL segments)", () => {
    const slugs = new Set(CHAINS.map((c) => c.slug));
    expect(slugs.size).toBe(CHAINS.length);
  });
});

describe("chainById", () => {
  it("returns the matching chain", () => {
    const c = chainById(369);
    expect(c?.name).toBe("PulseChain");
  });

  it("returns undefined for an unregistered chain id", () => {
    expect(chainById(999999)).toBeUndefined();
  });
});

describe("chainLogoUrl", () => {
  it("returns a gib.show URL with the CAIP-2 eip155 prefix", () => {
    expect(chainLogoUrl(1)).toBe("https://gib.show/eip155:1");
    expect(chainLogoUrl(369)).toBe("https://gib.show/eip155:369");
  });

  it("does not validate that the chain id is registered (lookup-free)", () => {
    // The helper is a URL builder, not a validator — gib.show may
    // serve future chain ids we don't yet have an entry for.
    expect(chainLogoUrl(8453)).toBe("https://gib.show/eip155:8453");
  });
});

describe("ALL_CHAINS sentinel", () => {
  it("is a negative number to distinguish from real chain ids", () => {
    // EIP-155 chain ids are positive integers. A negative sentinel
    // can never collide with a real chain id.
    expect(ALL_CHAINS).toBeLessThan(0);
  });

  it("does not equal any registered chain id", () => {
    expect(CHAINS.find((c) => c.id === ALL_CHAINS)).toBeUndefined();
  });
});
