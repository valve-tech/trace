/**
 * Unit tests for fetchFromSourcify — the Sourcify-side branch of the
 * source-code verification fallback chain (BlockScout → Sourcify → null).
 *
 * Pins the wire shape down so a future Sourcify API migration can't
 * silently break the fallback path again. The 2025 migration retired
 * `/server/repository/contracts/{full,partial}_match/<chain>/<addr>/`
 * (now 404s for every request) and replaced it with a single
 * `/server/files/any/<chain>/<addr>` endpoint that returns
 * `{ status: "full" | "partial", files: [...] }`.
 *
 * Mocks globalThis.fetch and inspects (a) which URL was called and (b)
 * what the function returns for each upstream shape.
 */

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { fetchFromSourcify } from "../../src/services/sourceCode/sourcify.js";
import { UpstreamError } from "../../src/services/sourceCode/types.js";

interface FetchCall {
  url: string;
}

const mockFetch = (
  scenario: (call: FetchCall) =>
    | { status: number; body: unknown }
    | { status: number; bodyText: string },
): { calls: FetchCall[]; restore: () => void } => {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url });
    const r = scenario({ url });
    const body =
      "bodyText" in r ? r.bodyText : JSON.stringify(r.body);
    return new Response(body, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
};

const ADDR = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";

describe("fetchFromSourcify (current Sourcify API)", () => {
  let mock: ReturnType<typeof mockFetch> | undefined;
  afterEach(() => {
    mock?.restore();
    mock = undefined;
  });

  it("calls /server/files/any/<chain>/<addr> — NOT the retired /repository/contracts/ paths", async () => {
    mock = mockFetch(() => ({ status: 404, body: {} }));
    await fetchFromSourcify(ADDR);
    assert.equal(mock.calls.length, 1, "exactly one upstream request");
    const url = mock.calls[0]?.url ?? "";
    assert.match(url, /\/server\/files\/any\/369\//, "must hit /server/files/any/369/");
    assert.doesNotMatch(
      url,
      /\/repository\/contracts\//,
      "must NOT hit the retired /repository/contracts/ paths (404 since 2025)",
    );
    assert.match(url, new RegExp(ADDR.toLowerCase(), "i"));
  });

  it("returns null on definitive 404 (Sourcify said 'not verified here')", async () => {
    mock = mockFetch(() => ({ status: 404, body: {} }));
    const out = await fetchFromSourcify(ADDR);
    assert.equal(out, null);
  });

  it("throws UpstreamError on 5xx (so getVerifiedSource can distinguish 'down' from 'not here')", async () => {
    mock = mockFetch(() => ({ status: 503, body: { error: "service unavailable" } }));
    await assert.rejects(() => fetchFromSourcify(ADDR), (err: unknown) => {
      assert.ok(err instanceof UpstreamError);
      return true;
    });
  });

  it("throws UpstreamError on fetch network failure", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    try {
      await assert.rejects(() => fetchFromSourcify(ADDR), (err: unknown) => {
        assert.ok(err instanceof UpstreamError);
        assert.match((err as Error).message, /ECONNREFUSED/);
        return true;
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("returns a VerifiedSource for a partial match (most PulseChain verifications are partial)", async () => {
    mock = mockFetch(() => ({
      status: 200,
      body: {
        status: "partial",
        files: [
          {
            name: "WPLS.sol",
            path: "contracts/partial_match/369/0xabc/sources/WPLS.sol",
            content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract WPLS {}\n",
          },
          {
            name: "metadata.json",
            path: "contracts/partial_match/369/0xabc/metadata.json",
            content: JSON.stringify({
              compiler: { version: "0.8.20+commit.a1b79de6" },
              output: { abi: [{ type: "fallback" }] },
            }),
          },
        ],
      },
    }));

    const out = await fetchFromSourcify(ADDR);
    assert.ok(out, "should return a VerifiedSource");
    assert.equal(out.address, ADDR.toLowerCase());
    assert.equal(out.chainSource, "sourcify");
    assert.equal(out.contractName, "WPLS");
    assert.equal(out.compilerVersion, "0.8.20+commit.a1b79de6");
    assert.equal(out.sourceFiles.length, 1);
    assert.equal(out.sourceFiles[0]?.name, "WPLS.sol");
    assert.deepEqual(out.abi, [{ type: "fallback" }]);
  });

  it("returns a VerifiedSource for a full match (same shape, status differs)", async () => {
    mock = mockFetch(() => ({
      status: 200,
      body: {
        status: "full",
        files: [
          { name: "Foo.sol", path: "contracts/full_match/369/0xabc/Foo.sol", content: "contract Foo {}" },
        ],
      },
    }));
    const out = await fetchFromSourcify(ADDR);
    assert.ok(out);
    assert.equal(out.sourceFiles.length, 1);
    assert.equal(out.contractName, "Foo");
  });

  it("returns null when the response has no .sol source files", async () => {
    mock = mockFetch(() => ({
      status: 200,
      body: {
        status: "partial",
        files: [
          { name: "metadata.json", path: "x", content: "{}" },
          // No .sol files
        ],
      },
    }));
    const out = await fetchFromSourcify(ADDR);
    assert.equal(out, null);
  });

  it("returns null when files array is empty", async () => {
    mock = mockFetch(() => ({ status: 200, body: { status: "partial", files: [] } }));
    const out = await fetchFromSourcify(ADDR);
    assert.equal(out, null);
  });

  it("tolerates malformed metadata.json (partial matches often have non-canonical metadata)", async () => {
    mock = mockFetch(() => ({
      status: 200,
      body: {
        status: "partial",
        files: [
          { name: "metadata.json", path: "x", content: "this is not json" },
          { name: "Foo.sol", path: "y", content: "contract Foo {}" },
        ],
      },
    }));
    const out = await fetchFromSourcify(ADDR);
    assert.ok(out, "malformed metadata must not nuke the whole response");
    assert.equal(out.compilerVersion, null);
    assert.deepEqual(out.abi, []);
    assert.equal(out.sourceFiles[0]?.name, "Foo.sol");
  });
});
