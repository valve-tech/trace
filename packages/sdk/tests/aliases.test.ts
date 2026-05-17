import { describe, it, expect } from "vitest";
import {
  parseCallTrace,
  normalizeCallFrame,
  type CallNode,
  type TraceFrame,
} from "../src/index.js";
import { sampleRawCallFrame } from "./fixtures.js";

describe("consumer-friendly aliases", () => {
  it("parseCallTrace and normalizeCallFrame are the same function", () => {
    expect(parseCallTrace).toBe(normalizeCallFrame);
  });

  it("parseCallTrace produces a CallNode (which is structurally TraceFrame)", () => {
    const node: CallNode = parseCallTrace(sampleRawCallFrame());
    // CallNode and TraceFrame must be assignable to each other — the type
    // system checks this at compile time, but a runtime sanity check
    // exercises the alias-export path too.
    const frame: TraceFrame = node;
    expect(frame.type).toBe("CALL");
    expect(frame.children).toHaveLength(2);
  });
});
