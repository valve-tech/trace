/**
 * Unit tests for:
 *   packages/api/src/services/sourceCode/sourcify.ts
 *   packages/api/src/services/sourceCode/blockscout.ts
 *
 * globalThis.fetch is stubbed per-test; the stub is always restored in
 * afterEach to prevent test-order dependencies.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  fetchFromSourcify,
  submitToSourcify,
} from "../../src/services/sourceCode/sourcify.js";
import { fetchFromBlockScout } from "../../src/services/sourceCode/blockscout.js";
import { UpstreamError } from "../../src/services/sourceCode/types.js";

// ---------------------------------------------------------------------------
// Fetch stub helpers
// ---------------------------------------------------------------------------

type FetchStub = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

let originalFetch: typeof globalThis.fetch;

function stubFetch(impl: FetchStub) {
  globalThis.fetch = impl as typeof globalThis.fetch;
}

function makeFetchResponse(
  body: unknown,
  status = 200,
  ok?: boolean,
): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Sourcify fixtures
// ---------------------------------------------------------------------------

const ADDRESS = "0xdead000000000000000000000000000000000001";

/** A minimal Sourcify /files response with one .sol source and metadata. */
function makeSourcifyFilesResponse(contractName = "MyToken") {
  return [
    {
      name: "metadata.json",
      path: `/contracts/full_match/369/${ADDRESS}/metadata.json`,
      content: JSON.stringify({
        compiler: { version: "0.8.20+commit.a1b79de6" },
        output: {
          abi: [
            {
              type: "function",
              name: "name",
              inputs: [],
              outputs: [{ type: "string" }],
              stateMutability: "view",
            },
          ],
        },
      }),
    },
    {
      name: `${contractName}.sol`,
      path: `/contracts/full_match/369/${ADDRESS}/${contractName}.sol`,
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract MyToken {}",
    },
  ];
}

// ---------------------------------------------------------------------------
// fetchFromSourcify
// ---------------------------------------------------------------------------

// fetchFromSourcify suite moved to ./sourcify.test.ts after the 2025
// Sourcify API migration (/server/repository/contracts/{full,partial}_match/
// → /server/files/any/<chain>/<addr>). The previous tests asserted the
// retired 2-call directory-check + /files/ flow; the new tests in
// sourcify.test.ts assert the single-call shape and explicitly guard
// against re-introducing the deprecated paths.

describe("fetchFromSourcify (legacy block kept empty — see sourcify.test.ts)", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

});

// ---------------------------------------------------------------------------
// submitToSourcify
// ---------------------------------------------------------------------------

describe("submitToSourcify", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const REQ = {
    address: ADDRESS,
    chainId: 369,
    files: {
      "metadata.json": "{}",
      "MyToken.sol": "// SPDX-License-Identifier: MIT\ncontract MyToken {}",
    },
  };

  it("success returns {ok: true, match: 'perfect'} with storageTimestamp", async () => {
    stubFetch(async () =>
      makeFetchResponse({
        result: [
          {
            address: ADDRESS,
            chainId: "369",
            status: "perfect",
            storageTimestamp: "2024-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = await submitToSourcify(REQ);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.match, "perfect");
      assert.equal(result.storageTimestamp, "2024-01-01T00:00:00.000Z");
    }
  });

  it("success returns {ok: true, match: 'partial'} for partial match", async () => {
    stubFetch(async () =>
      makeFetchResponse({
        result: [{ address: ADDRESS, chainId: "369", status: "partial" }],
      }),
    );

    const result = await submitToSourcify(REQ);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.match, "partial");
    }
  });

  it("storageTimestamp is null when absent from Sourcify response", async () => {
    stubFetch(async () =>
      makeFetchResponse({
        result: [{ status: "perfect" }],
      }),
    );

    const result = await submitToSourcify(REQ);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.storageTimestamp, null);
    }
  });

  it("upstream rejection (bytecode mismatch) returns {ok: false, error}", async () => {
    stubFetch(async () =>
      makeFetchResponse(
        {
          result: [
            { status: "error", message: "deployed bytecode does not match" },
          ],
        },
        200,
      ),
    );

    const result = await submitToSourcify(REQ);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.error.includes("deployed bytecode does not match"),
        `unexpected error: ${result.error}`,
      );
    }
  });

  it("non-ok HTTP with error body returns {ok: false, error} from body.error", async () => {
    stubFetch(async () =>
      makeFetchResponse(
        { error: "missing metadata.json" },
        400,
        false,
      ),
    );

    const result = await submitToSourcify(REQ);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("missing metadata.json"));
    }
  });

  it("non-ok HTTP with no parseable body returns {ok: false} with fallback message", async () => {
    stubFetch(async () => ({
      ok: false,
      status: 400,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response));

    const result = await submitToSourcify(REQ);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("400"));
    }
  });

  it("5xx response throws UpstreamError", async () => {
    stubFetch(async () => makeFetchResponse({}, 502));

    await assert.rejects(
      () => submitToSourcify(REQ),
      (err: unknown) => err instanceof UpstreamError,
    );
  });

  it("network throw wraps in UpstreamError", async () => {
    stubFetch(async () => {
      throw new Error("timeout");
    });

    await assert.rejects(
      () => submitToSourcify(REQ),
      (err: unknown) => err instanceof UpstreamError,
    );
  });
});

// ---------------------------------------------------------------------------
// fetchFromBlockScout
// ---------------------------------------------------------------------------

describe("fetchFromBlockScout", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const BS_ADDRESS = "0xdead000000000000000000000000000000000002";

  /** A minimal valid BlockScout v1 getsourcecode response. */
  function makeBlockScoutSuccess(overrides: Partial<{
    SourceCode: string;
    ABI: string;
    ContractName: string;
    CompilerVersion: string;
    OptimizationUsed: string;
    Runs: string;
    AdditionalSources: Array<{ Filename: string; SourceCode: string }>;
  }> = {}) {
    return {
      status: "1",
      result: [
        {
          SourceCode: "// SPDX-License-Identifier: MIT\ncontract Token {}",
          ABI: JSON.stringify([
            { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }] },
          ]),
          ContractName: "Token",
          CompilerVersion: "v0.8.20+commit.a1b79de6",
          OptimizationUsed: "1",
          Runs: "200",
          ...overrides,
        },
      ],
    };
  }

  /** Stub that always returns no v2 data for the smart-contracts endpoint. */
  function stubBothEndpoints(v1Response: unknown, v1Status = 200) {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes("/api/v2/smart-contracts/")) {
        return makeFetchResponse({}, 404, false);
      }
      return makeFetchResponse(v1Response, v1Status, v1Status >= 200 && v1Status < 300);
    });
  }

  it("success path: returns VerifiedSource with expected shape", async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes("/api/v2/smart-contracts/")) {
        return makeFetchResponse(
          { source_map: "1:2:3", deployed_bytecode: "0x6080" },
        );
      }
      return makeFetchResponse(makeBlockScoutSuccess());
    });

    const result = await fetchFromBlockScout(BS_ADDRESS);

    assert.ok(result !== null);
    assert.equal(result.chainSource, "blockscout");
    assert.equal(result.address, BS_ADDRESS.toLowerCase());
    assert.equal(result.contractName, "Token");
    assert.equal(result.compilerVersion, "v0.8.20+commit.a1b79de6");
    assert.equal(result.optimizationUsed, true);
    assert.equal(result.optimizationRuns, 200);
    assert.ok(result.sourceFiles.length >= 1);
    assert.equal(result.sourceFiles[0]?.name, "Token.sol");
    assert.ok(Array.isArray(result.abi) && result.abi.length > 0);
    assert.equal(result.sourceMap, "1:2:3");
    assert.equal(result.deployedBytecode, "0x6080");
  });

  it("v2 missing/non-ok: sourceMap and deployedBytecode are null", async () => {
    stubBothEndpoints(makeBlockScoutSuccess());

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.ok(result !== null);
    assert.equal(result.sourceMap, null);
    assert.equal(result.deployedBytecode, null);
  });

  it("returns null on 404 from upstream (not verified)", async () => {
    stubFetch(async () => makeFetchResponse({}, 404, false));

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.equal(result, null);
  });

  // Regression: blockscout.ts:102 used to swallow UpstreamError in its
  // outer catch, cementing transient 5xx upstreams as permanent negative
  // cache entries. Fix re-throws UpstreamError before the null fallthrough.
  it("throws UpstreamError on 5xx (regression: outer catch used to swallow it)", async () => {
    stubFetch(async () => makeFetchResponse({}, 503));

    await assert.rejects(
      () => fetchFromBlockScout(BS_ADDRESS),
      (err: unknown) => err instanceof UpstreamError,
    );
  });

  it("throws UpstreamError on network error (fetch throws)", async () => {
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    await assert.rejects(
      () => fetchFromBlockScout(BS_ADDRESS),
      (err: unknown) => err instanceof UpstreamError,
    );
  });

  it("returns null when BlockScout status is not '1'", async () => {
    stubBothEndpoints({ status: "0", result: [] });

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.equal(result, null);
  });

  it("returns null when SourceCode is empty string", async () => {
    stubBothEndpoints(makeBlockScoutSuccess({ SourceCode: "" }));

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.equal(result, null);
  });

  it("handles malformed ABI JSON gracefully (falls back to empty array)", async () => {
    stubBothEndpoints(makeBlockScoutSuccess({ ABI: "{not valid json[[[" }));

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.ok(result !== null);
    assert.deepEqual(result.abi, []);
  });

  it("AdditionalSources are added to sourceFiles", async () => {
    stubBothEndpoints(
      makeBlockScoutSuccess({
        AdditionalSources: [
          { Filename: "IERC20.sol", SourceCode: "// interface" },
        ],
      }),
    );

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.ok(result !== null);
    assert.equal(result.sourceFiles.length, 2);
    assert.equal(result.sourceFiles[1]?.name, "IERC20.sol");
  });

  it("optimizationUsed is false when OptimizationUsed is '0'", async () => {
    stubBothEndpoints(makeBlockScoutSuccess({ OptimizationUsed: "0" }));

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.ok(result !== null);
    assert.equal(result.optimizationUsed, false);
  });

  it("optimizationRuns is null when Runs is empty/absent", async () => {
    stubBothEndpoints(makeBlockScoutSuccess({ Runs: "" }));

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.ok(result !== null);
    assert.equal(result.optimizationRuns, null);
  });

  it("contractName is null when ContractName is empty", async () => {
    stubBothEndpoints(makeBlockScoutSuccess({ ContractName: "" }));

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.ok(result !== null);
    assert.equal(result.contractName, null);
  });

  it("falls back to 'Contract.sol' filename when ContractName is empty", async () => {
    stubBothEndpoints(makeBlockScoutSuccess({ ContractName: "" }));

    const result = await fetchFromBlockScout(BS_ADDRESS);
    assert.ok(result !== null);
    assert.equal(result.sourceFiles[0]?.name, "Contract.sol");
  });
});
