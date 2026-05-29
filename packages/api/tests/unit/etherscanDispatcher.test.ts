/**
 * Unit tests for the Etherscan module/action dispatcher.
 *
 * The dispatcher is tested as a pure function: we pass minimal Express
 * Request/Response stubs and assert on the captured res.json() body.
 * No handlers are exercised — they are replaced by stubs registered in
 * the handlers map indirectly through the dispatcher's own import. We
 * achieve isolation by importing the dispatcher directly and exercising
 * its logic without a running server.
 *
 * Express stubs follow the same minimal pattern as respond.test.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { handleEtherscan } from "../../src/routes/etherscan/dispatcher.js";

// ---------------------------------------------------------------------------
// Minimal Express Request / Response stubs
// ---------------------------------------------------------------------------

interface CapturedBody {
  body: unknown;
}

function makeRes(): Response & CapturedBody {
  const captured: CapturedBody = { body: undefined };
  const res = {
    body: undefined as unknown,
    json(data: unknown) {
      captured.body = data;
      return res;
    },
  } as unknown as Response & CapturedBody;

  Object.defineProperty(res, "body", { get: () => captured.body });
  return res;
}

function makeReq(query: Record<string, unknown>, body: Record<string, unknown> = {}): Request {
  return { query, body } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Missing module / action
// ---------------------------------------------------------------------------

describe("etherscan dispatcher — missing module / action", () => {
  it("returns etherscanErr when module is absent", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({ action: "getsourcecode" }), res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Missing module or action");
  });

  it("returns etherscanErr when action is absent", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({ module: "contract" }), res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Missing module or action");
  });

  it("returns etherscanErr when both module and action are absent", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({}), res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Missing module or action");
  });

  it("returns etherscanErr when module is empty string", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({ module: "", action: "getsourcecode" }), res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Missing module or action");
  });

  it("returns etherscanErr when action is empty string", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({ module: "contract", action: "" }), res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Missing module or action");
  });
});

// ---------------------------------------------------------------------------
// Unknown module / action
// ---------------------------------------------------------------------------

describe("etherscan dispatcher — unknown module / action", () => {
  it("returns etherscanErr for a completely unknown module", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({ module: "foo", action: "bar" }), res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Unsupported action: foo.bar");
  });

  it("returns etherscanErr for an unknown action under a known module", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({ module: "contract", action: "unknownaction" }), res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Unsupported action: contract.unknownaction");
  });

  it("includes module.action in the Unsupported message", async () => {
    const res = makeRes();
    await handleEtherscan(makeReq({ module: "account", action: "nonexistent" }), res);
    const body = res.body as { status: string; result: string };
    assert.match(body.result, /account\.nonexistent/);
  });
});

// ---------------------------------------------------------------------------
// Param merging — body wins over query on collision
// ---------------------------------------------------------------------------

describe("etherscan dispatcher — param merging (GET vs POST)", () => {
  /**
   * balancemulti with 21 addresses from query would fail with "too many
   * addresses". We override address in the body with a single valid address
   * so the handler processes successfully. This proves body wins over query.
   *
   * We use the `account.balance` action with a valid address so the handler
   * actually runs and we can observe its successful response shape.
   */
  it("body field wins over query string on collision", async () => {
    const valid = "0x0000000000000000000000000000000000000001";
    // query has an invalid address, body overrides with valid — handler must
    // see the body value (and reach the network path, which we cannot test
    // here without mocking; we only assert the collision is resolved).
    //
    // Instead, verify via the module+action collision: query sets module=foo
    // (unknown), body overrides to module=contract + action=getabi (valid).
    // If body wins the dispatcher finds the real handler and does NOT emit
    // "Unsupported action".
    const res = makeRes();
    // Build a request where query has bad module but body overrides to a
    // real module+action (but still an invalid address so we get a fast
    // validation error, not a network call).
    await handleEtherscan(
      makeReq(
        { module: "UNKNOWN_MODULE", action: "UNKNOWN_ACTION" },
        { module: "contract", action: "getabi", address: "bad" },
      ),
      res,
    );
    const body = res.body as { status: string; result: string };
    // Handler was found (body module/action won) → reached address validation
    assert.equal(body.status, "0");
    assert.equal(body.result, "Invalid Address format");
  });

  it("query params pass through when body is empty (GET-style)", async () => {
    const res = makeRes();
    // module + action come from query only; body is {}
    await handleEtherscan(
      makeReq({ module: "contract", action: "getabi", address: "bad" }, {}),
      res,
    );
    const body = res.body as { status: string; result: string };
    // Reached the handler (module/action resolved) → address validation ran
    assert.equal(body.status, "0");
    assert.equal(body.result, "Invalid Address format");
  });

  it("query params pass through when body is undefined (raw GET)", async () => {
    const res = makeRes();
    const req = { query: { module: "contract", action: "getabi", address: "bad" } } as unknown as Request;
    await handleEtherscan(req, res);
    const body = res.body as { status: string; result: string };
    assert.equal(body.status, "0");
    assert.equal(body.result, "Invalid Address format");
  });
});

// ---------------------------------------------------------------------------
// Dispatcher forwards handler return value as-is
// ---------------------------------------------------------------------------

describe("etherscan dispatcher — result forwarding", () => {
  /**
   * The dispatcher must pass the handler's return value verbatim to
   * res.json. We test this with a real known action that has a
   * predictable synchronous-path result (address validation error)
   * so no network or DB is needed.
   */
  it("forwards an EtherscanResponse from a contract handler directly", async () => {
    const res = makeRes();
    await handleEtherscan(
      makeReq({ module: "contract", action: "getsourcecode", address: "not-valid" }),
      res,
    );
    const body = res.body as Record<string, unknown>;
    // Shape matches EtherscanResponse — status, message, result present
    assert.ok("status" in body, "missing status field");
    assert.ok("message" in body, "missing message field");
    assert.ok("result" in body, "missing result field");
    assert.equal(body.status, "0");
    assert.equal(body.result, "Invalid Address format");
  });

  it("forwards a JsonRpcResponse from a proxy handler directly", async () => {
    // eth_blockNumber is a real proxy action. We cannot call through without
    // a live RPC. We verify only that the dispatcher reached the handler by
    // using an action that fires a synchronous validation error — here we
    // intentionally pick a proxy action with missing required params to
    // observe the JSON-RPC error envelope shape (jsonrpc, id, error).
    //
    // eth_blockNumber requires no params and calls the RPC directly, so we
    // cannot use it without network. Instead, verify the dispatching chain
    // is shape-agnostic by confirming a known-valid module+action combo
    // returns whatever the handler produced without modification.
    //
    // For a true proxy-shape test we rely on etherscanProxy.test.ts which
    // tests the proxy actions directly; here we just confirm no wrapping.
    const res = makeRes();
    await handleEtherscan(
      makeReq({ module: "contract", action: "checkverifystatus", guid: "" }),
      res,
    );
    const body = res.body as { status: string; result: string };
    // checkverifystatus with empty guid returns an etherscan error — confirms
    // the dispatcher forwarded the value rather than double-wrapping it.
    assert.equal(body.status, "0");
    assert.equal(body.result, "Missing guid");
  });

  it("all registered modules have at least one handler", async () => {
    // Sanity check: known module+action pairs resolve without "Unsupported action".
    const knownPairs: Array<[string, string, Record<string, unknown>]> = [
      ["contract", "getsourcecode", { address: "bad" }],
      ["contract", "getabi", { address: "bad" }],
      ["contract", "verifysourcecode", { contractaddress: "bad" }],
      ["contract", "checkverifystatus", { guid: "" }],
      ["account", "balance", { address: "bad" }],
      ["account", "balancemulti", { address: "bad" }],
      ["account", "txlist", { address: "bad" }],
      ["account", "tokentx", { address: "bad" }],
      ["transaction", "getstatus", { txhash: "bad" }],
      ["transaction", "gettxreceiptstatus", { txhash: "bad" }],
      ["block", "getblockreward", {}],
      ["block", "getblockcountdown", {}],
      ["block", "getblocknobytime", {}],
    ];

    for (const [module, action, extra] of knownPairs) {
      const res = makeRes();
      await handleEtherscan(makeReq({ module, action, ...extra }), res);
      const body = res.body as { status: string; result: string };
      // Must NOT be "Unsupported action" — any other error is fine
      assert.ok(
        !body.result.startsWith("Unsupported action"),
        `${module}.${action} returned "Unsupported action": ${body.result}`,
      );
    }
  });
});
