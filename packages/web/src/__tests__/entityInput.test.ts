import { describe, it, expect } from "vitest";
import { classifyInput, routeForInput } from "../lib/entityInput";
import { ALL_CHAINS } from "../lib/chains";

const TX = "0x" + "a".repeat(64);
const ADDR = "0x" + "b".repeat(40);
const SELECTOR = "0x" + "c".repeat(8);

describe("classifyInput", () => {
  it("recognizes a 66-char hex as a tx hash", () => {
    expect(classifyInput(TX)).toBe("tx");
  });
  it("recognizes a 42-char hex as an address", () => {
    expect(classifyInput(ADDR)).toBe("address");
  });
  it("recognizes a 10-char hex as a selector", () => {
    expect(classifyInput(SELECTOR)).toBe("selector");
  });
  it("recognizes pure digits as a block number", () => {
    expect(classifyInput("21840194")).toBe("block");
  });
  it("trims surrounding whitespace", () => {
    expect(classifyInput(`  ${ADDR}  `)).toBe("address");
  });
  it("returns null for empty or unrecognized input", () => {
    expect(classifyInput("")).toBeNull();
    expect(classifyInput("hello")).toBeNull();
    expect(classifyInput("0x123")).toBeNull();
  });
});

describe("routeForInput", () => {
  it("routes each recognized kind to its EIP-3091 path", () => {
    expect(routeForInput(TX)).toBe(`/tx/${TX}`);
    expect(routeForInput(ADDR)).toBe(`/address/${ADDR}`);
    expect(routeForInput(SELECTOR)).toBe(`/explorer?selector=${SELECTOR}`); // not a scan entity
    expect(routeForInput("123")).toBe("/block/123");
  });
  it("returns null for unrecognized input", () => {
    expect(routeForInput("not-a-thing")).toBeNull();
    expect(routeForInput("")).toBeNull();
  });
  it("scopes the route to a specific chain via ?chainid, but leaves all-chains bare", () => {
    expect(routeForInput(TX, 1)).toBe(`/tx/${TX}?chainid=1`);
    expect(routeForInput("123", 943)).toBe("/block/123?chainid=943");
    // a route that already has a query string gets `&chainid`
    expect(routeForInput(SELECTOR, 1)).toBe(`/explorer?selector=${SELECTOR}&chainid=1`);
    // all-chains (the default) carries no chain param
    expect(routeForInput(ADDR, ALL_CHAINS)).toBe(`/address/${ADDR}`);
    expect(routeForInput(ADDR)).toBe(`/address/${ADDR}`);
  });
});
