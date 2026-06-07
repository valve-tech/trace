import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  jsonRpcErr,
  jsonRpcOk,
} from "../../src/routes/etherscan/envelope.js";
import { getRpcClient } from "../../src/services/chains/clients.js";
import { DEFAULT_CHAIN_ID } from "../../src/services/chains/registry.js";
import {
  ethBlockNumberAction,
  ethCallAction,
  ethEstimateGasAction,
  ethGetCodeAction,
  ethSendRawTransactionAction,
  proxyActions,
} from "../../src/routes/etherscan/handlers/proxy.js";

type RpcCall = { method: string; params: unknown };

interface ClientWithRequest {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
}

/**
 * Proxy actions resolve their client via `getRpcClient(chainId)`. With no
 * chain passed they fall back to the registry default (PulseChain 369), so
 * patching that client's `request` is what intercepts the forwarded call.
 */
function patchRequest(impl: (call: RpcCall) => Promise<unknown> | unknown) {
  const client = getRpcClient(DEFAULT_CHAIN_ID) as unknown as ClientWithRequest;
  const original = client.request;
  const calls: RpcCall[] = [];
  client.request = async ({ method, params }) => {
    const call: RpcCall = { method, params };
    calls.push(call);
    return impl(call);
  };
  return {
    calls,
    restore: () => {
      client.request = original;
    },
  };
}

describe("jsonRpc envelope helpers", () => {
  it("jsonRpcOk wraps with jsonrpc=2.0 and default id=1", () => {
    assert.deepEqual(jsonRpcOk("0x1"), {
      jsonrpc: "2.0",
      id: 1,
      result: "0x1",
    });
  });

  it("jsonRpcOk echoes a provided id", () => {
    assert.deepEqual(jsonRpcOk({ hash: "0xab" }, 83), {
      jsonrpc: "2.0",
      id: 83,
      result: { hash: "0xab" },
    });
  });

  it("jsonRpcErr defaults code to -32000 and id to 1", () => {
    assert.deepEqual(jsonRpcErr("upstream down"), {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: "upstream down" },
    });
  });

  it("jsonRpcErr accepts custom code and id", () => {
    assert.deepEqual(jsonRpcErr("oops", -32601, 7), {
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32601, message: "oops" },
    });
  });
});

describe("etherscan proxy actions", () => {
  let patch: ReturnType<typeof patchRequest> | null = null;

  beforeEach(() => {
    patch = null;
  });

  afterEach(() => {
    patch?.restore();
    patch = null;
  });

  it("registers all 14 documented proxy actions", () => {
    const expected = [
      "eth_blockNumber",
      "eth_getBlockByNumber",
      "eth_getBlockByHash",
      "eth_getBlockTransactionCountByNumber",
      "eth_getTransactionByHash",
      "eth_getTransactionByBlockNumberAndIndex",
      "eth_getTransactionCount",
      "eth_getTransactionReceipt",
      "eth_call",
      "eth_getCode",
      "eth_getStorageAt",
      "eth_gasPrice",
      "eth_estimateGas",
      "eth_sendRawTransaction",
    ];
    for (const action of expected) {
      assert.ok(
        typeof proxyActions[action] === "function",
        `missing action: ${action}`,
      );
    }
    assert.equal(Object.keys(proxyActions).length, expected.length);
  });

  it("eth_blockNumber forwards no params and wraps in JSON-RPC envelope", async () => {
    patch = patchRequest(() => "0x1234");
    const out = await ethBlockNumberAction({});
    assert.deepEqual(out, { jsonrpc: "2.0", id: 1, result: "0x1234" });
    assert.equal(patch.calls.length, 1);
    assert.equal(patch.calls[0]?.method, "eth_blockNumber");
    assert.deepEqual(patch.calls[0]?.params, []);
  });

  it("eth_blockNumber echoes provided id (numeric)", async () => {
    patch = patchRequest(() => "0x99");
    const out = await ethBlockNumberAction({ id: 83 });
    assert.deepEqual(out, { jsonrpc: "2.0", id: 83, result: "0x99" });
  });

  it("eth_blockNumber coerces string id to number", async () => {
    patch = patchRequest(() => "0x99");
    const out = await ethBlockNumberAction({ id: "42" });
    assert.equal(
      (out as { id: number }).id,
      42,
      "string id should be coerced",
    );
  });

  it("eth_call passes [{to, data}, tag] with tag default 'latest'", async () => {
    patch = patchRequest(() => "0xdeadbeef");
    const out = await ethCallAction({ to: "0xabc", data: "0x70a0" });
    assert.deepEqual(out, { jsonrpc: "2.0", id: 1, result: "0xdeadbeef" });
    assert.equal(patch.calls[0]?.method, "eth_call");
    assert.deepEqual(patch.calls[0]?.params, [
      { to: "0xabc", data: "0x70a0" },
      "latest",
    ]);
  });

  it("eth_call honors a provided tag", async () => {
    patch = patchRequest(() => "0x00");
    await ethCallAction({ to: "0xabc", data: "0x70a0", tag: "0x10" });
    assert.deepEqual(patch.calls[0]?.params, [
      { to: "0xabc", data: "0x70a0" },
      "0x10",
    ]);
  });

  it("eth_getCode defaults tag to 'latest'", async () => {
    patch = patchRequest(() => "0x6080");
    await ethGetCodeAction({ address: "0xfeed" });
    assert.deepEqual(patch.calls[0]?.params, ["0xfeed", "latest"]);
  });

  it("eth_estimateGas strips undefined fields", async () => {
    patch = patchRequest(() => "0x5208");
    await ethEstimateGasAction({ to: "0xabc", value: "0x1" });
    assert.deepEqual(patch.calls[0]?.params, [{ to: "0xabc", value: "0x1" }]);
  });

  it("eth_sendRawTransaction forwards [hex] and returns the tx hash", async () => {
    patch = patchRequest(() => "0xtxhash");
    const out = await ethSendRawTransactionAction({ hex: "0xf86c..." });
    assert.deepEqual(out, { jsonrpc: "2.0", id: 1, result: "0xtxhash" });
    assert.deepEqual(patch.calls[0]?.params, ["0xf86c..."]);
  });

  it("wraps upstream errors as JSON-RPC error envelopes", async () => {
    patch = patchRequest(() => {
      throw new Error("execution reverted: bad input");
    });
    const out = await ethCallAction({ to: "0xabc", data: "0x00", id: 9 });
    assert.deepEqual(out, {
      jsonrpc: "2.0",
      id: 9,
      error: { code: -32000, message: "execution reverted: bad input" },
    });
  });
});
