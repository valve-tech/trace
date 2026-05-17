import { describe, it, expect } from "vitest";
import {
  loadTraceFromObject,
  loadTraceFromFile,
  loadTraceFromHash,
  normalizeCallFrame,
} from "../src/loaders/index.js";
import { sampleRawCallFrame, addrs } from "./fixtures.js";

describe("normalizeCallFrame", () => {
  it("converts hex strings to bigints", () => {
    const frame = normalizeCallFrame(sampleRawCallFrame());
    expect(frame.value).toBe(100_000_000_000_000_000n); // 0.1 ETH in wei
    expect(frame.gas).toBe(0x186a0n);
    expect(frame.gasUsed).toBe(0xc350n);
  });

  it("lowercases addresses", () => {
    const raw = sampleRawCallFrame();
    raw.from = raw.from.toUpperCase();
    const frame = normalizeCallFrame(raw);
    expect(frame.from).toBe(addrs.ALICE);
  });

  it("renames `calls` to `children` and assigns depth", () => {
    const frame = normalizeCallFrame(sampleRawCallFrame());
    expect(frame.children).toHaveLength(2);
    expect(frame.depth).toBe(0);
    expect(frame.children[0]!.depth).toBe(1);
    expect(frame.children[1]!.depth).toBe(1);
  });

  it("sets `to` to null for CREATE frames", () => {
    const frame = normalizeCallFrame({
      type: "CREATE",
      from: addrs.ALICE,
      to: addrs.CONTRACT, // some clients echo back the created address; we discard
      gas: "0x1000",
      gasUsed: "0x500",
      input: "0x60806040",
    });
    expect(frame.to).toBeNull();
    expect(frame.type).toBe("CREATE");
  });

  it("coerces unknown call types to CALL", () => {
    const frame = normalizeCallFrame({
      type: "INVALID_OPCODE",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gas: "0x0",
      gasUsed: "0x0",
      input: "0x",
    });
    expect(frame.type).toBe("CALL");
  });

  it("defaults missing value to 0n", () => {
    const frame = normalizeCallFrame({
      type: "STATICCALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gas: "0x1000",
      gasUsed: "0x100",
      input: "0x70a08231",
    });
    expect(frame.value).toBe(0n);
  });

  it("preserves revertReason and error", () => {
    const frame = normalizeCallFrame(sampleRawCallFrame());
    expect(frame.children[1]!.error).toBe("execution reverted");
    expect(frame.children[1]!.revertReason).toBe("insufficient balance");
  });
});

describe("loadTraceFromObject", () => {
  it("wraps a normalized frame in a TraceResult", () => {
    const result = loadTraceFromObject({
      callFrame: sampleRawCallFrame(),
      txHash: "0xabc",
      blockNumber: 12345n,
    });
    expect(result.trace.type).toBe("CALL");
    expect(result.txHash).toBe("0xabc");
    expect(result.blockNumber).toBe(12345n);
    expect(result.opcodes).toBeUndefined();
  });

  it("attaches normalized opcode steps when provided", () => {
    const result = loadTraceFromObject({
      callFrame: sampleRawCallFrame(),
      structLogs: [
        {
          pc: 0,
          op: "PUSH1",
          gas: 100,
          gasCost: 3,
          depth: 1,
          stack: ["0x60"],
          memory: [],
          storage: {},
        },
      ],
    });
    expect(result.opcodes).toHaveLength(1);
    expect(result.opcodes![0]!.op).toBe("PUSH1");
  });
});

describe("loadTraceFromFile", () => {
  it("parses a JSON string into a TraceResult", () => {
    const json = JSON.stringify({ callFrame: sampleRawCallFrame() });
    const result = loadTraceFromFile(json);
    expect(result.trace.children).toHaveLength(2);
  });

  it("throws on invalid JSON", () => {
    expect(() => loadTraceFromFile("not json")).toThrow(/invalid JSON/);
  });

  it("throws when callFrame is missing", () => {
    expect(() => loadTraceFromFile("{}")).toThrow(/callFrame/);
  });
});

describe("normalizeCallFrame edge cases", () => {
  it("coerces invalid hex in value to 0n (no throw)", () => {
    const frame = normalizeCallFrame({
      type: "CALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      value: "not-a-hex-string",
      gas: "0x1000",
      gasUsed: "0x100",
      input: "0x",
    });
    expect(frame.value).toBe(0n);
  });

  it("throws when depth exceeds MAX_NORMALIZE_DEPTH", () => {
    // Build a 2048-deep linear chain in the raw format
    type Raw = ReturnType<typeof sampleRawCallFrame>;
    let leaf: Raw = {
      type: "CALL",
      from: addrs.ALICE,
      to: addrs.CONTRACT,
      gas: "0x0",
      gasUsed: "0x0",
      input: "0x",
    };
    for (let i = 0; i < 2048; i++) {
      leaf = {
        type: "CALL",
        from: addrs.ALICE,
        to: addrs.CONTRACT,
        gas: "0x0",
        gasUsed: "0x0",
        input: "0x",
        calls: [leaf],
      };
    }
    expect(() => normalizeCallFrame(leaf)).toThrow(/MAX_NORMALIZE_DEPTH/);
  });

  it("normalizes empty `to` ('0x' or empty string) to null on non-CREATE frames", () => {
    const frame = normalizeCallFrame({
      type: "CALL",
      from: addrs.ALICE,
      to: "0x",
      gas: "0x0",
      gasUsed: "0x0",
      input: "0x",
    });
    expect(frame.to).toBeNull();
  });

  it("defaults missing `from` to '0x' (defensive)", () => {
    const frame = normalizeCallFrame({
      type: "CALL",
      from: "",
      to: addrs.CONTRACT,
      gas: "0x0",
      gasUsed: "0x0",
      input: "0x",
    });
    expect(frame.from).toBe("0x");
  });
});

describe("loadTraceFromHash", () => {
  it("calls debug_traceTransaction with callTracer mode", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const mockFetch: typeof globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: sampleRawCallFrame() }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await loadTraceFromHash({
      txHash: "0xdeadbeef",
      rpcUrl: "https://rpc.example.test",
      fetch: mockFetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://rpc.example.test");
    const body = calls[0]!.body as { method: string; params: unknown[] };
    expect(body.method).toBe("debug_traceTransaction");
    expect(body.params).toEqual(["0xdeadbeef", { tracer: "callTracer" }]);
    expect(result.trace.children).toHaveLength(2);
    expect(result.txHash).toBe("0xdeadbeef");
  });

  it("throws when the RPC returns an error", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "Method not found" },
        }),
        { status: 200 },
      );

    await expect(
      loadTraceFromHash({
        txHash: "0xdeadbeef",
        rpcUrl: "https://rpc.example.test",
        fetch: mockFetch,
      }),
    ).rejects.toThrow(/Method not found/);
  });

  it("throws on HTTP error", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" });

    await expect(
      loadTraceFromHash({
        txHash: "0xdeadbeef",
        rpcUrl: "https://rpc.example.test",
        fetch: mockFetch,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("throws when the RPC returns neither result nor error", async () => {
    const mockFetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1 }), { status: 200 });

    await expect(
      loadTraceFromHash({
        txHash: "0xdeadbeef",
        rpcUrl: "https://rpc.example.test",
        fetch: mockFetch,
      }),
    ).rejects.toThrow(/no result/);
  });

  it("throws when no fetch implementation is available", async () => {
    // Use a stubbed global to simulate an environment with no fetch
    const origFetch = globalThis.fetch;
    // @ts-expect-error -- intentional unset for this test
    delete (globalThis as { fetch?: unknown }).fetch;

    try {
      await expect(
        loadTraceFromHash({
          txHash: "0xdeadbeef",
          rpcUrl: "https://rpc.example.test",
        }),
      ).rejects.toThrow(/no fetch implementation/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
