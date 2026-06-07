/**
 * Unit tests for the Etherscan `?chainid=N` resolution path:
 *
 *   - resolveChain / defaultChain (routes/etherscan/chain.ts)
 *   - dispatcher chainid gating (rejects bad/unsupported ids before dispatch)
 *   - per-handler chain selection (which client / blockscout / chifra each
 *     handler picks, and which handlers reject non-default chains because
 *     their backing service is still PulseChain-bound)
 *
 * Everything is exercised as pure functions with injected/stubbed deps —
 * no live server, no live RPC. RPC-direct handlers (proxy, account.balance,
 * block.getblockcountdown) are pointed at a per-chain client whose `request`
 * / high-level methods are stubbed.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";

import { handleEtherscan } from "../../src/routes/etherscan/dispatcher.js";
import { resolveChain, defaultChain } from "../../src/routes/etherscan/chain.js";
import { getRpcClient } from "../../src/services/chains/clients.js";
import { DEFAULT_CHAIN_ID, getChain } from "../../src/services/chains/registry.js";
import {
  balanceAction,
  txListAction,
} from "../../src/routes/etherscan/handlers/account.js";
import { getBlockCountdownAction } from "../../src/routes/etherscan/handlers/block.js";
import {
  getStatusAction,
  getTxReceiptStatusAction,
} from "../../src/routes/etherscan/handlers/transaction.js";
import {
  getSourceCodeAction,
  getAbiAction,
  verifySourceCodeAction,
} from "../../src/routes/etherscan/handlers/contract.js";
import { ethBlockNumberAction } from "../../src/routes/etherscan/handlers/proxy.js";

// ---------------------------------------------------------------------------
// Express stubs (same minimal pattern as etherscanDispatcher.test.ts)
// ---------------------------------------------------------------------------

interface CapturedBody {
  body: unknown;
}

function makeRes(): Response & CapturedBody {
  const captured: CapturedBody = { body: undefined };
  const res = {
    json(data: unknown) {
      captured.body = data;
      return res;
    },
  } as unknown as Response & CapturedBody;
  Object.defineProperty(res, "body", { get: () => captured.body });
  return res;
}

function makeReq(query: Record<string, unknown>): Request {
  return { query, body: {} } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Per-chain client stubbing
// ---------------------------------------------------------------------------

type AnyFn = (...args: unknown[]) => unknown;

function patchClientMethod(chainId: number, key: string, impl: AnyFn) {
  const client = getRpcClient(chainId) as unknown as Record<string, AnyFn>;
  const original = client[key];
  client[key] = impl;
  return {
    restore: () => {
      client[key] = original;
    },
  };
}

const VALID_ADDRESS = "0x0000000000000000000000000000000000000001";
const VALID_TXHASH =
  "0x0000000000000000000000000000000000000000000000000000000000000abc";

// ===========================================================================
// resolveChain
// ===========================================================================

describe("etherscan resolveChain", () => {
  it("defaults to DEFAULT_CHAIN_ID when chainid is absent", () => {
    const r = resolveChain({});
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.chain.chainId, DEFAULT_CHAIN_ID);
  });

  it("defaults to DEFAULT_CHAIN_ID when chainid is an empty string", () => {
    const r = resolveChain({ chainid: "" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.chain.chainId, DEFAULT_CHAIN_ID);
  });

  it("resolves a supported chainid passed as a string (Etherscan query shape)", () => {
    const r = resolveChain({ chainid: "1" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.chain.chainId, 1);
  });

  it("resolves a supported chainid passed as a number", () => {
    const r = resolveChain({ chainid: 943 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.chain.chainId, 943);
  });

  it("rejects an unsupported chainid with an Etherscan error envelope", () => {
    const r = resolveChain({ chainid: "8453" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.status, "0");
      assert.match(r.error.result, /Unsupported chainId: 8453/);
    }
  });

  it("rejects a non-numeric chainid", () => {
    const r = resolveChain({ chainid: "abc" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error.result, /Invalid chainid/);
  });

  it("rejects a zero / negative chainid", () => {
    for (const bad of ["0", "-1"]) {
      const r = resolveChain({ chainid: bad });
      assert.equal(r.ok, false, `chainid=${bad} should be rejected`);
    }
  });

  it("defaultChain() returns the registry default", () => {
    assert.equal(defaultChain().chainId, DEFAULT_CHAIN_ID);
  });
});

// ===========================================================================
// Dispatcher chainid gating
// ===========================================================================

describe("etherscan dispatcher — chainid gating", () => {
  it("rejects an unsupported chainid before reaching the handler", async () => {
    const res = makeRes();
    await handleEtherscan(
      makeReq({
        module: "account",
        action: "balance",
        address: VALID_ADDRESS,
        chainid: "8453",
      }),
      res,
    );
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.match(body.result, /Unsupported chainId: 8453/);
  });

  it("rejects a malformed chainid before reaching the handler", async () => {
    const res = makeRes();
    await handleEtherscan(
      makeReq({
        module: "proxy",
        action: "eth_blockNumber",
        chainid: "not-a-number",
      }),
      res,
    );
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.match(body.result, /Invalid chainid/);
  });

  it("passes the resolved chain through to the handler (proxy on chain 1)", async () => {
    const patch = patchClientMethod(1, "request", async () => "0xfeed");
    try {
      const res = makeRes();
      await handleEtherscan(
        makeReq({ module: "proxy", action: "eth_blockNumber", chainid: "1" }),
        res,
      );
      assert.deepEqual(res.body, { jsonrpc: "2.0", id: 1, result: "0xfeed" });
    } finally {
      patch.restore();
    }
  });
});

// ===========================================================================
// Proxy — per-chain client selection
// ===========================================================================

describe("etherscan proxy — selects the per-request chain client", () => {
  it("forwards through getRpcClient(chainId) for an explicit chain", async () => {
    const patch1 = patchClientMethod(1, "request", async () => "0xmainnet");
    const patch943 = patchClientMethod(943, "request", async () => "0xtestnet");
    try {
      const onMainnet = await ethBlockNumberAction({}, getChain(1));
      const onTestnet = await ethBlockNumberAction({}, getChain(943));
      assert.deepEqual(onMainnet, { jsonrpc: "2.0", id: 1, result: "0xmainnet" });
      assert.deepEqual(onTestnet, { jsonrpc: "2.0", id: 1, result: "0xtestnet" });
    } finally {
      patch1.restore();
      patch943.restore();
    }
  });

  it("falls back to the default chain when no chain is passed", async () => {
    const patch = patchClientMethod(
      DEFAULT_CHAIN_ID,
      "request",
      async () => "0xdefault",
    );
    try {
      const out = await ethBlockNumberAction({});
      assert.deepEqual(out, { jsonrpc: "2.0", id: 1, result: "0xdefault" });
    } finally {
      patch.restore();
    }
  });
});

// ===========================================================================
// account.balance — per-chain native balance
// ===========================================================================

describe("etherscan account.balance — per-chain client", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("reads getBalance from the requested chain's client", async () => {
    const patch = patchClientMethod(943, "getBalance", async () => 123n);
    restore = patch.restore;
    const res = await balanceAction({ address: VALID_ADDRESS }, getChain(943));
    assert.equal(res.status, "1");
    if (res.status === "1") assert.equal(res.result, "123");
  });

  it("defaults to the default chain's client when none is passed", async () => {
    const patch = patchClientMethod(DEFAULT_CHAIN_ID, "getBalance", async () => 7n);
    restore = patch.restore;
    const res = await balanceAction({ address: VALID_ADDRESS });
    assert.equal(res.status, "1");
    if (res.status === "1") assert.equal(res.result, "7");
  });
});

// ===========================================================================
// block.getblockcountdown — per-chain ETA
// ===========================================================================

describe("etherscan block.getblockcountdown — per-chain block time", () => {
  it("uses the requested chain's defaultBlockTimeSeconds for ETA", async () => {
    // Ethereum (12s/block): head=1000, target=1010 → remaining=10, eta=120s.
    const patch = patchClientMethod(1, "getBlockNumber", async () => 1000n);
    try {
      const res = await getBlockCountdownAction(
        { blockno: "1010" },
        getChain(1),
      );
      assert.equal(res.status, "1");
      if (res.status === "1") {
        assert.equal(res.result.RemainingBlock, "10");
        assert.equal(res.result.EstimateTimeInSec, "120");
      }
    } finally {
      patch.restore();
    }
  });
});

// ===========================================================================
// Service-backed handlers — reject non-default chains (no silent wrong-chain)
// ===========================================================================

describe("etherscan service-backed handlers — reject non-default chains", () => {
  it("account.txlist rejects a non-default chain", async () => {
    const res = await txListAction({ address: VALID_ADDRESS }, getChain(1));
    assert.equal(res.status, "0");
    assert.match(res.result as string, /not yet supported for chainId 1/);
  });

  it("transaction.getstatus rejects a non-default chain", async () => {
    const res = await getStatusAction({ txhash: VALID_TXHASH }, getChain(1));
    assert.equal(res.status, "0");
    assert.match(res.result as string, /not yet supported for chainId 1/);
  });

  it("transaction.gettxreceiptstatus rejects a non-default chain", async () => {
    const res = await getTxReceiptStatusAction(
      { txhash: VALID_TXHASH },
      getChain(943),
    );
    assert.equal(res.status, "0");
    assert.match(res.result as string, /not yet supported for chainId 943/);
  });

  it("contract.getsourcecode rejects a non-default chain", async () => {
    const res = await getSourceCodeAction({ address: VALID_ADDRESS }, getChain(1));
    assert.equal(res.status, "0");
    assert.match(res.result as string, /not yet supported for chainId 1/);
  });

  it("contract.getabi rejects a non-default chain", async () => {
    const res = await getAbiAction({ address: VALID_ADDRESS }, getChain(1));
    assert.equal(res.status, "0");
    assert.match(res.result as string, /not yet supported for chainId 1/);
  });
});

// ===========================================================================
// contract.verifysourcecode — gates on sourcifyEnabled
// ===========================================================================

describe("etherscan contract.verifysourcecode — sourcify gating", () => {
  it("rejects a chain whose registry entry has sourcifyEnabled=false (943)", async () => {
    // 943 is sourcifyEnabled:false; the gate fires before any address parse.
    const res = await verifySourceCodeAction(
      {
        contractaddress: VALID_ADDRESS,
        codeformat: "solidity-standard-json-input",
      },
      getChain(943),
    );
    assert.equal(res.status, "0");
    assert.match(res.result as string, /not available for chainId 943/);
  });

  it("passes the sourcify gate for a sourcify-enabled chain and continues validating", async () => {
    // Chain 1 is sourcifyEnabled:true → past the gate, then hits the normal
    // address validation (bad address) rather than the chain error.
    const res = await verifySourceCodeAction(
      {
        contractaddress: "bad",
        codeformat: "solidity-standard-json-input",
      },
      getChain(1),
    );
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });
});
