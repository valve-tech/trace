import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchBlock } from "../api/explorer";

/**
 * Tests the Etherscan-migrated `fetchBlock`. The function dispatches by
 * input shape — a 66-char "0x"-prefixed input goes to
 * `proxy.eth_getBlockByHash`; anything else (decimal or short hex or a
 * symbolic tag) goes to `proxy.eth_getBlockByNumber` after a hex encode.
 *
 * We mock `globalThis.fetch` with a URL-discriminating router so a single
 * test can drive either endpoint by URL shape, and we assert the hex →
 * decimal-string conversion is applied to every numeric field.
 */

const BLOCK_NUMBER = "12345";
const BLOCK_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

interface FetchRoute {
  matcher: (url: string) => boolean;
  response: Partial<{
    ok: boolean;
    status: number;
    body: unknown;
  }>;
}

function stubFetchRoutes(routes: FetchRoute[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const route = routes.find((r) => r.matcher(url));
    if (!route) {
      throw new Error(`No stub matches ${url}`);
    }
    return {
      ok: route.response.ok ?? true,
      status: route.response.status ?? 200,
      json: async () => route.response.body,
    } as Response;
  });
}

/** Minimal RPC block payload with one type-2 tx. */
const sampleRpcBlock = {
  number: "0x3039", // 12345
  hash: "0xaaaa",
  parentHash: "0xprev",
  timestamp: "0x60000000", // 1610612736
  miner: "0xminer",
  gasUsed: "0xf4240", // 1_000_000
  gasLimit: "0x1c9c380", // 30_000_000
  baseFeePerGas: "0x7", // 7
  size: "0x21f", // 543
  transactions: [
    {
      hash: "0xtx1",
      from: "0xfrom",
      to: "0xto",
      value: "0xde0b6b3a7640000", // 1 PLS in wei
      gasPrice: "0x1",
      maxFeePerGas: "0x2",
      maxPriorityFeePerGas: "0x1",
      type: "0x2",
      input: "0xa9059cbb000000000000000000000000",
    },
  ],
};

describe("fetchBlock (Etherscan-migrated)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("decodes a block by number, converting every hex field to decimal", async () => {
    stubFetchRoutes([
      {
        matcher: (u) =>
          u.includes("action=eth_getBlockByNumber") && u.includes("tag=0x3039"),
        response: {
          body: { jsonrpc: "2.0", id: 1, result: sampleRpcBlock },
        },
      },
    ]);

    const block = await fetchBlock(BLOCK_NUMBER);
    expect(block.number).toBe("12345");
    expect(block.hash).toBe("0xaaaa");
    expect(block.parentHash).toBe("0xprev");
    expect(block.timestamp).toBe(1610612736);
    expect(block.miner).toBe("0xminer");
    expect(block.gasUsed).toBe("1000000");
    expect(block.gasLimit).toBe("30000000");
    expect(block.baseFeePerGas).toBe("7");
    expect(block.size).toBe("543");
    expect(block.transactionCount).toBe(1);

    const [tx] = block.transactions;
    expect(tx!.hash).toBe("0xtx1");
    expect(tx!.value).toBe("1000000000000000000");
    expect(tx!.valuePLS).toBe("1");
    expect(tx!.methodId).toBe("0xa9059cbb");
    expect(tx!.type).toBe("0x2");
    expect(tx!.gasUsed).toBeNull(); // dropped from the legacy receipt fan-out
  });

  it("dispatches a 66-char 0x input to eth_getBlockByHash", async () => {
    stubFetchRoutes([
      {
        matcher: (u) =>
          u.includes("action=eth_getBlockByHash") &&
          u.includes(`hash=${BLOCK_HASH}`),
        response: {
          body: { jsonrpc: "2.0", id: 1, result: sampleRpcBlock },
        },
      },
    ]);

    const block = await fetchBlock(BLOCK_HASH);
    expect(block.number).toBe("12345");
    expect(block.hash).toBe("0xaaaa");
  });

  it("forwards symbolic tags ('latest') without hex-encoding", async () => {
    stubFetchRoutes([
      {
        matcher: (u) =>
          u.includes("action=eth_getBlockByNumber") &&
          u.includes("tag=latest"),
        response: {
          body: { jsonrpc: "2.0", id: 1, result: sampleRpcBlock },
        },
      },
    ]);

    const block = await fetchBlock("latest");
    expect(block.transactionCount).toBe(1);
  });

  it("treats a missing baseFeePerGas as null (pre-EIP-1559)", async () => {
    const preLondonBlock = { ...sampleRpcBlock, baseFeePerGas: undefined };
    stubFetchRoutes([
      {
        matcher: (u) => u.includes("action=eth_getBlockByNumber"),
        response: {
          body: { jsonrpc: "2.0", id: 1, result: preLondonBlock },
        },
      },
    ]);

    const block = await fetchBlock(BLOCK_NUMBER);
    expect(block.baseFeePerGas).toBeNull();
  });

  it("handles a zero-tx block without crashing", async () => {
    const emptyBlock = { ...sampleRpcBlock, transactions: [] };
    stubFetchRoutes([
      {
        matcher: () => true,
        response: {
          body: { jsonrpc: "2.0", id: 1, result: emptyBlock },
        },
      },
    ]);

    const block = await fetchBlock(BLOCK_NUMBER);
    expect(block.transactionCount).toBe(0);
    expect(block.transactions).toEqual([]);
  });

  it("derives methodId='0x' for transfers (short input)", async () => {
    const transferBlock = {
      ...sampleRpcBlock,
      transactions: [
        {
          ...sampleRpcBlock.transactions[0]!,
          input: "0x",
        },
      ],
    };
    stubFetchRoutes([
      {
        matcher: () => true,
        response: {
          body: { jsonrpc: "2.0", id: 1, result: transferBlock },
        },
      },
    ]);

    const block = await fetchBlock(BLOCK_NUMBER);
    expect(block.transactions[0]!.methodId).toBe("0x");
  });

  it("surfaces a JSON-RPC error envelope as a thrown Error", async () => {
    stubFetchRoutes([
      {
        matcher: () => true,
        response: {
          body: {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: "header not found" },
          },
        },
      },
    ]);

    await expect(fetchBlock(BLOCK_NUMBER)).rejects.toThrow(
      /header not found/,
    );
  });

  it("surfaces 'Block not found' when result is null", async () => {
    stubFetchRoutes([
      {
        matcher: () => true,
        response: {
          body: { jsonrpc: "2.0", id: 1, result: null },
        },
      },
    ]);

    await expect(fetchBlock("99999999999")).rejects.toThrow(/Block not found/);
  });

  it("surfaces non-2xx HTTP responses as a thrown Error", async () => {
    stubFetchRoutes([
      {
        matcher: () => true,
        response: { ok: false, status: 502 },
      },
    ]);

    await expect(fetchBlock(BLOCK_NUMBER)).rejects.toThrow(/HTTP 502/);
  });
});
