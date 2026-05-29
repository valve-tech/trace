import { describe, it, expect } from "vitest";
import { scanPath } from "../lib/scanRoutes";

describe("scanPath", () => {
  it("builds a tx path", () => {
    expect(scanPath("tx", "0xabc")).toBe("/tx/0xabc");
  });

  it("builds a block path for a number", () => {
    expect(scanPath("block", "1234")).toBe("/block/1234");
  });

  it("builds a block path for a hash", () => {
    expect(scanPath("block", "0xdeadbeef")).toBe("/block/0xdeadbeef");
  });

  it("builds an address path", () => {
    expect(scanPath("address", "0x0000000000000000000000000000000000000001")).toBe(
      "/address/0x0000000000000000000000000000000000000001",
    );
  });

  it("builds a contract path under /token/", () => {
    expect(scanPath("contract", "0xCAFE")).toBe("/token/0xCAFE");
  });

  it("does not transform or encode the value", () => {
    // Values are pre-validated by callers; the helper is a pure path concat.
    expect(scanPath("tx", "weird value")).toBe("/tx/weird value");
  });
});
