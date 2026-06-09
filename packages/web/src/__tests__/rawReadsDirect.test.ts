import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchAddressInfo, fetchBlock, fetchTransaction } from "../api/explorer";
import { setRpcOverride, clearRpcOverride } from "../lib/rpcEndpoint";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

/**
 * "Raw reads direct": when a per-chain bring-your-own-RPC override is set, the
 * raw-able explorer reads (balance / code / block) must go STRAIGHT to the
 * user's node — never the `/api` dispatcher — and parse the node's hex results.
 * These tests pin that routing + parsing; the dispatcher path (no override) is
 * covered byte-identically by fetchAddressInfo.test.ts / fetchBlock.test.ts.
 */

const OVERRIDE = "https://my-node.example/rpc";
const ADDR = "0xdeadbeef00000000000000000000000000000001";
const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const BLOCK_HASH =
  "0xabc1230000000000000000000000000000000000000000000000000000000000";

type RpcHandler = (method: string, params: unknown[]) => unknown;

/** Mock fetch as the user's node; assert every call hits the override URL. */
function stubNode(handler: RpcHandler): void {
  vi.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    expect(String(input)).toBe(OVERRIDE); // direct to the node, not /api
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: unknown[];
    };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: handler(body.method, body.params),
      }),
    } as Response;
  }) as typeof fetch);
}

const RPC_BLOCK = {
  number: "0x3039", // 12345
  hash: BLOCK_HASH,
  parentHash: "0xparent",
  timestamp: "0x60d", // 1549
  miner: "0xminer",
  gasUsed: "0x5208", // 21000
  gasLimit: "0x1c9c380",
  baseFeePerGas: "0x7",
  size: "0x220",
  transactions: [
    {
      hash: "0xtx1",
      from: "0xfrom",
      to: "0xto",
      value: "0xde0b6b3a7640000", // 1e18
      input: "0xa9059cbb0000",
      type: "0x2",
    },
  ],
};

describe("raw reads direct (BYO-RPC override set)", () => {
  beforeEach(() => {
    setRpcOverride(DEFAULT_CHAIN_ID, OVERRIDE);
  });
  afterEach(() => {
    clearRpcOverride(DEFAULT_CHAIN_ID);
    vi.restoreAllMocks();
  });

  it("fetchAddressInfo reads balance + code from the node and normalizes hex", async () => {
    stubNode((method) => {
      if (method === "eth_getBalance") return "0xde0b6b3a7640000"; // 1e18
      if (method === "eth_getCode") return "0x60806040";
      throw new Error(`unexpected method ${method}`);
    });

    const info = await fetchAddressInfo(ADDR);
    expect(info.balance).toBe("1000000000000000000");
    expect(info.balancePLS).toBe("1");
    expect(info.isContract).toBe(true);
  });

  it("fetchAddressInfo treats node '0x' code as an EOA", async () => {
    stubNode((method) => (method === "eth_getBalance" ? "0x0" : "0x"));
    const info = await fetchAddressInfo(ADDR);
    expect(info.isContract).toBe(false);
    expect(info.balance).toBe("0");
  });

  it("fetchAddressInfo surfaces a node error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "node says no" },
        }),
      }) as Response) as typeof fetch);
    await expect(fetchAddressInfo(ADDR)).rejects.toThrow(/node says no/);
  });

  it("fetchBlock by number calls eth_getBlockByNumber with a hex tag", async () => {
    let seenMethod = "";
    let seenTag: unknown;
    stubNode((method, params) => {
      seenMethod = method;
      seenTag = params[0];
      return RPC_BLOCK;
    });

    const block = await fetchBlock("12345");
    expect(seenMethod).toBe("eth_getBlockByNumber");
    expect(seenTag).toBe("0x3039");
    expect(block.number).toBe("12345");
    expect(block.gasUsed).toBe("21000");
    expect(block.transactions[0]!.valuePLS).toBe("1");
    expect(block.transactions[0]!.methodId).toBe("0xa9059cbb");
  });

  it("fetchBlock by hash calls eth_getBlockByHash with the hash", async () => {
    let seenMethod = "";
    let seenKey: unknown;
    stubNode((method, params) => {
      seenMethod = method;
      seenKey = params[0];
      return { ...RPC_BLOCK, hash: BLOCK_HASH };
    });

    const block = await fetchBlock(BLOCK_HASH);
    expect(seenMethod).toBe("eth_getBlockByHash");
    expect(seenKey).toBe(BLOCK_HASH);
    expect(block.hash).toBe(BLOCK_HASH);
  });

  it("fetchBlock surfaces a node error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "block boom" },
        }),
      }) as Response) as typeof fetch);
    await expect(fetchBlock("12345")).rejects.toThrow(/block boom/);
  });
});

describe("raw reads direct — fetchTransaction (BYO-RPC override set)", () => {
  const TX_HASH =
    "0xfeed000000000000000000000000000000000000000000000000000000000001";
  const RAW_TX = { hash: TX_HASH, from: A, to: B, value: "0xde0b6b3a7640000" };
  const RAW_RECEIPT = { transactionHash: TX_HASH, status: "0x1", logs: [] };
  // The backend's enriched response (we only assert it's passed through).
  const ENRICHED = {
    hash: TX_HASH,
    from: A,
    to: B,
    value: "1000000000000000000",
    decodedInput: null,
    decodedLogs: [],
    internalTransactions: [],
    tokenTransfers: [],
  };

  beforeEach(() => setRpcOverride(DEFAULT_CHAIN_ID, OVERRIDE));
  afterEach(() => {
    clearRpcOverride(DEFAULT_CHAIN_ID);
    vi.restoreAllMocks();
  });

  it("reads raw tx+receipt from the node, then enriches via /from-raw", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (url === OVERRIDE) {
        const method = (body as { method: string }).method;
        const result =
          method === "eth_getTransactionByHash" ? RAW_TX : RAW_RECEIPT;
        return {
          ok: true,
          status: 200,
          json: async () => ({ jsonrpc: "2.0", id: 1, result }),
        } as Response;
      }
      // the /from-raw enrichment call → the backend
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: ENRICHED }),
      } as Response;
    }) as typeof fetch);

    const tx = await fetchTransaction(TX_HASH);

    // raw reads went to the node
    const nodeCalls = calls.filter((c) => c.url === OVERRIDE);
    expect(nodeCalls.map((c) => (c.body as { method: string }).method).sort()).toEqual([
      "eth_getTransactionByHash",
      "eth_getTransactionReceipt",
    ]);
    // enrichment POST went to /from-raw carrying the node's raw payloads
    const enrichCall = calls.find((c) => c.url.includes("/from-raw"));
    expect(enrichCall).toBeTruthy();
    expect((enrichCall!.body as { tx: unknown }).tx).toEqual(RAW_TX);
    expect((enrichCall!.body as { receipt: unknown }).receipt).toEqual(RAW_RECEIPT);
    // the enriched backend result is returned verbatim
    expect(tx).toEqual(ENRICHED);
  });

  it("throws when the node can't find the tx", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: null }),
      }) as Response) as typeof fetch);
    await expect(fetchTransaction(TX_HASH)).rejects.toThrow(/not found/i);
  });
});
