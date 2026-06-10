/**
 * Unit tests for the shared REST `chainid` resolution helper
 * (lib/chainParam.ts) used by the alerts / simulate / fork / testnets
 * routes. Mirrors the Etherscan dispatcher contract: omitted → default
 * chain, supported → that chain, malformed/unsupported → 400 ApiError.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveChainIdParam } from "../../src/lib/chainParam.js";
import { ApiError } from "../../src/lib/respond.js";
import { DEFAULT_CHAIN_ID } from "../../src/services/chains/registry.js";

function expectApiError(fn: () => unknown, status: number): ApiError {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ApiError, `expected ApiError, got ${String(err)}`);
    assert.equal(err.status, status);
    return err;
  }
  assert.fail("expected the call to throw");
}

describe("resolveChainIdParam", () => {
  it("defaults to DEFAULT_CHAIN_ID when omitted", () => {
    assert.equal(resolveChainIdParam(undefined), DEFAULT_CHAIN_ID);
  });

  it("treats empty string (bare ?chainid= key) as omitted", () => {
    assert.equal(resolveChainIdParam(""), DEFAULT_CHAIN_ID);
  });

  it("treats null as omitted", () => {
    assert.equal(resolveChainIdParam(null), DEFAULT_CHAIN_ID);
  });

  it("accepts every launch-set chain, as string or number", () => {
    for (const id of [1, 369, 943]) {
      assert.equal(resolveChainIdParam(id), id);
      assert.equal(resolveChainIdParam(String(id)), id);
    }
  });

  it("rejects malformed input with a 400", () => {
    expectApiError(() => resolveChainIdParam("abc"), 400);
    expectApiError(() => resolveChainIdParam("1.5"), 400);
    expectApiError(() => resolveChainIdParam(-1), 400);
    expectApiError(() => resolveChainIdParam(0), 400);
  });

  it("rejects unsupported chain ids with a 400 naming the id", () => {
    const err = expectApiError(() => resolveChainIdParam(56), 400);
    assert.match(err.message, /56/);
  });
});
