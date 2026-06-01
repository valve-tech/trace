import { describe, it, expect } from "vitest";
import { parseBulkPaste } from "../lib/workspace/bulkParse";

const ADDR = "0xabc0000000000000000000000000000000000123";
const ADDR2 = "0xdef0000000000000000000000000000000000456";
const TX =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("parseBulkPaste", () => {
  it("extracts every entity kind from a mixed multi-line blob", () => {
    const out = parseBulkPaste(`${ADDR}\n${TX}\n21840192`);
    expect(out).toEqual([
      { kind: "tx", value: TX },
      { kind: "address", value: ADDR },
      { kind: "block", value: "21840192" },
    ]);
  });

  it("dedupes (address pasted twice → one item; same address mixed case)", () => {
    const out = parseBulkPaste(`${ADDR}\n${ADDR.toUpperCase()}`);
    expect(out).toEqual([{ kind: "address", value: ADDR }]);
  });

  it("does not extract the first 40 hex chars of a tx hash as a separate address", () => {
    const out = parseBulkPaste(TX);
    expect(out).toEqual([{ kind: "tx", value: TX }]);
  });

  it("accepts comma-separated paste", () => {
    const out = parseBulkPaste(`${ADDR}, ${ADDR2}`);
    expect(out).toEqual([
      { kind: "address", value: ADDR },
      { kind: "address", value: ADDR2 },
    ]);
  });

  it("accepts mixed casing addresses (EIP-55 style) and normalizes them", () => {
    const checksum = "0xAbC0000000000000000000000000000000000123";
    const out = parseBulkPaste(checksum);
    expect(out).toEqual([{ kind: "address", value: checksum.toLowerCase() }]);
  });

  it("does NOT match a naked digit that's part of prose", () => {
    const out = parseBulkPaste(`gas limit: 30000000 wei`);
    expect(out).toEqual([]);
  });

  it("matches a naked digit on its own line as a block number", () => {
    const out = parseBulkPaste(`  21840192  `);
    expect(out).toEqual([{ kind: "block", value: "21840192" }]);
  });

  it("ignores empty / whitespace-only input", () => {
    expect(parseBulkPaste("")).toEqual([]);
    expect(parseBulkPaste("   \n  \n")).toEqual([]);
  });

  it("extracts an address embedded in a comment-like line", () => {
    const out = parseBulkPaste(`// the proxy: ${ADDR}`);
    expect(out).toEqual([{ kind: "address", value: ADDR }]);
  });
});
