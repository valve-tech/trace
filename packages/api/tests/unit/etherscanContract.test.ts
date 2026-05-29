/**
 * Unit tests for the Etherscan `contract` module handlers.
 *
 * Isolation strategy:
 *   1. `globalThis.fetch` is stubbed per-test to control BlockScout and
 *      Sourcify responses that flow through the real getVerifiedSource
 *      call chain. This follows the same pattern as sourceCode.test.ts.
 *   2. `pool.query` is patched to return an empty-rows cache miss, so
 *      every test hits the fetch path rather than the DB cache.
 *   3. `storeVerifyResult` / `lookupVerifyResult` use the in-memory GUID
 *      table, reset via `__resetForTesting` in beforeEach.
 *   4. Each test group uses a unique VALID_ADDRESS so the module-level
 *      NOT_FOUND_CACHE in getVerifiedSource.ts does not poison later tests
 *      in the same run. The negative cache keyed on address; using distinct
 *      addresses eliminates cross-test interference without modifying
 *      production code.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getSourceCodeAction,
  getAbiAction,
  verifySourceCodeAction,
  checkVerifyStatusAction,
} from "../../src/routes/etherscan/handlers/contract.js";
import { storeVerifyResult, __resetForTesting } from "../../src/routes/etherscan/verifyShim.js";
import { pool } from "../../src/services/pool.js";

// ---------------------------------------------------------------------------
// Address constants — each test group that exercises the network path
// uses a unique address so the module-level NOT_FOUND_CACHE never crosses
// group boundaries.
// ---------------------------------------------------------------------------

const INVALID_ADDRESSES = [
  "",
  "not-an-address",
  "0x123",
  "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
  "1234567890123456789012345678901234567890",
];

// One fresh address per test group to avoid NOT_FOUND_CACHE cross-contamination.
const ADDR_SOURCECODE_NOTFOUND  = "0xdead000000000000000000000000000000000001";
const ADDR_SOURCECODE_SINGLE    = "0xdead000000000000000000000000000000000002";
const ADDR_SOURCECODE_MULTI     = "0xdead000000000000000000000000000000000003";
const ADDR_SOURCECODE_UPSTREAM  = "0xdead000000000000000000000000000000000004";
const ADDR_SOURCECODE_RETHROW   = "0xdead000000000000000000000000000000000005";
const ADDR_ABI_NOTFOUND         = "0xdead000000000000000000000000000000000006";
const ADDR_ABI_EMPTY            = "0xdead000000000000000000000000000000000007";
const ADDR_ABI_SUCCESS          = "0xdead000000000000000000000000000000000008";
const ADDR_ABI_UPSTREAM         = "0xdead000000000000000000000000000000000009";
const ADDR_ABI_RETHROW          = "0xdead00000000000000000000000000000000000a";
const ADDR_VERIFY_VALID         = "0xdead00000000000000000000000000000000000b";

// ---------------------------------------------------------------------------
// Fetch / pool stub helpers
// ---------------------------------------------------------------------------

type FetchStub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let originalFetch: typeof globalThis.fetch;
let originalPoolQuery: typeof pool.query;

function stubFetch(impl: FetchStub): void {
  globalThis.fetch = impl as typeof globalThis.fetch;
}

/**
 * Stub pool.query to return an empty-row cache miss so getVerifiedSource
 * always falls through to the network path. Also absorbs cacheSource writes.
 */
function stubPoolCacheMiss(): void {
  (pool as unknown as { query: unknown }).query = async () => ({ rows: [] });
}

function makeFetchResponse(body: unknown, status = 200, ok?: boolean): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/**
 * Build a minimal BlockScout v1 getsourcecode response.
 */
function makeBlockScoutSuccess(overrides: {
  SourceCode?: string;
  ABI?: string;
  ContractName?: string;
  CompilerVersion?: string;
  OptimizationUsed?: string;
  Runs?: string;
  AdditionalSources?: Array<{ Filename: string; SourceCode: string }>;
} = {}) {
  const abi = [{ type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" }];
  return {
    status: "1",
    result: [
      {
        SourceCode: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract MyToken {}",
        ABI: JSON.stringify(abi),
        ContractName: "MyToken",
        CompilerVersion: "v0.8.20+commit.a1b79de6",
        OptimizationUsed: "1",
        Runs: "200",
        ...overrides,
      },
    ],
  };
}

/**
 * Stub fetch to return a BlockScout success for any request that looks
 * like a v1 API call (has module= in the URL) and 404 for everything else.
 * This covers `scan.pulsechain.com/api` as well as any configured
 * BLOCKSCOUT_API_URL because we match on `module=contract` query string.
 */
function stubBlockScoutSuccess(overrides: Parameters<typeof makeBlockScoutSuccess>[0] = {}): void {
  stubFetch(async (url) => {
    const u = String(url);
    // v2 smart-contracts — return no source map so tests stay focused
    if (u.includes("/api/v2/smart-contracts/")) {
      return makeFetchResponse({}, 404, false);
    }
    // v1 getsourcecode — match on query string shape used by fetchFromBlockScout
    if (u.includes("module=contract") && u.includes("action=getsourcecode")) {
      return makeFetchResponse(makeBlockScoutSuccess(overrides));
    }
    // Sourcify or anything else — 404 so only blockscout path activates
    return makeFetchResponse({}, 404, false);
  });
}

/**
 * Stub fetch so BOTH BlockScout and Sourcify definitively say "not found".
 * BlockScout returns status "0" (not verified); Sourcify returns 404.
 */
function stubNotFound(): void {
  stubFetch(async (url) => {
    const u = String(url);
    if (u.includes("/api/v2/smart-contracts/")) {
      return makeFetchResponse({}, 404, false);
    }
    // BlockScout v1 — status "0" → definitively "not verified"
    if (u.includes("module=contract") && u.includes("action=getsourcecode")) {
      return makeFetchResponse({ status: "0", result: [] });
    }
    // Sourcify — 404 → definitively "not there"
    return makeFetchResponse({}, 404, false);
  });
}

/**
 * Stub fetch so both upstreams return 503 → UpstreamError is thrown by
 * getVerifiedSource (neither upstream answered definitively).
 */
function stubUpstreamError(): void {
  stubFetch(async () => makeFetchResponse({}, 503));
}

/**
 * Stub fetch for the Sourcify verify endpoint only (verifysourcecode path).
 * All other calls (BlockScout) fall through to "not found".
 */
function stubSourcifySubmit(responseBody: unknown, status = 200): void {
  stubFetch(async (url) => {
    const u = String(url);
    if (u.includes("sourcify.dev") && u.includes("/verify")) {
      return makeFetchResponse(responseBody, status, status >= 200 && status < 300);
    }
    // BlockScout — not-found so we don't accidentally trigger getVerifiedSource
    if (u.includes("/api/v2/smart-contracts/")) {
      return makeFetchResponse({}, 404, false);
    }
    return makeFetchResponse({ status: "0", result: [] });
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalPoolQuery = pool.query.bind(pool);
  stubPoolCacheMiss();
  __resetForTesting();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (pool as unknown as { query: unknown }).query = originalPoolQuery;
});

// ===========================================================================
// getsourcecode
// ===========================================================================

describe("contract.getsourcecode — input validation", () => {
  for (const bad of INVALID_ADDRESSES) {
    it(`rejects address ${JSON.stringify(bad)}`, async () => {
      const res = await getSourceCodeAction({ address: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid Address format");
    });
  }

  it("rejects a missing address param", async () => {
    const res = await getSourceCodeAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });
});

describe("contract.getsourcecode — unverified address", () => {
  it("returns empty record with ABI='Contract source code not verified' when upstream returns null", async () => {
    stubNotFound();
    const res = await getSourceCodeAction({ address: ADDR_SOURCECODE_NOTFOUND });
    assert.equal(res.status, "1");
    const result = (res as { status: "1"; result: unknown[] }).result;
    assert.ok(Array.isArray(result) && result.length === 1);
    const record = result[0] as Record<string, string>;
    assert.equal(record.ABI, "Contract source code not verified");
    assert.equal(record.SourceCode, "");
    assert.equal(record.ContractName, "");
  });
});

describe("contract.getsourcecode — verified address (single file)", () => {
  it("returns SourceCode as raw Solidity for a single-file contract", async () => {
    stubBlockScoutSuccess({
      SourceCode: "// SPDX-License-Identifier: MIT\ncontract Single {}",
      ContractName: "Single",
      CompilerVersion: "v0.8.20+commit.a1b79de6",
      OptimizationUsed: "1",
      Runs: "300",
    });

    const res = await getSourceCodeAction({ address: ADDR_SOURCECODE_SINGLE });
    assert.equal(res.status, "1");

    const result = (res as { status: "1"; result: unknown[] }).result;
    assert.ok(Array.isArray(result) && result.length === 1);
    const record = result[0] as Record<string, string>;

    // Single file → bare source content (not double-brace-wrapped)
    assert.equal(record.SourceCode, "// SPDX-License-Identifier: MIT\ncontract Single {}");
    assert.equal(record.ContractName, "Single");
    assert.equal(record.CompilerVersion, "v0.8.20+commit.a1b79de6");
    assert.equal(record.OptimizationUsed, "1");
    assert.equal(record.Runs, "300");
  });
});

describe("contract.getsourcecode — verified address (multi-file)", () => {
  it("returns SourceCode as double-brace-wrapped standard JSON for multi-file contracts", async () => {
    stubBlockScoutSuccess({
      SourceCode: "// SPDX-License-Identifier: MIT\ncontract Main {}",
      ContractName: "Main",
      AdditionalSources: [
        { Filename: "IMain.sol", SourceCode: "// interface\ninterface IMain {}" },
      ],
    });

    const res = await getSourceCodeAction({ address: ADDR_SOURCECODE_MULTI });
    assert.equal(res.status, "1");

    const result = (res as { status: "1"; result: unknown[] }).result;
    const record = result[0] as Record<string, string>;

    // Multi-file → double-brace-wrapped JSON: "{" + JSON + "}"
    assert.ok(record.SourceCode.startsWith("{"), "should start with outer {");
    assert.ok(record.SourceCode.endsWith("}"), "should end with outer }");
    // Strip the outer brace pair (single char each side) to get inner JSON
    const inner = record.SourceCode.slice(1, -1);
    const parsed = JSON.parse(inner) as { language: string; sources: Record<string, unknown> };
    assert.equal(parsed.language, "Solidity");
    assert.ok("Main.sol" in parsed.sources, "Main.sol should be in sources");
    assert.ok("IMain.sol" in parsed.sources, "IMain.sol should be in sources");
  });
});

describe("contract.getsourcecode — upstream error", () => {
  it("returns etherscanErr when UpstreamError is thrown", async () => {
    stubUpstreamError();
    const res = await getSourceCodeAction({ address: ADDR_SOURCECODE_UPSTREAM });
    assert.equal(res.status, "0");
    assert.match(res.result as string, /temporarily unavailable/);
  });
});

describe("contract.getsourcecode — non-UpstreamError propagates", () => {
  it("rethrows errors that are not UpstreamError", async () => {
    // getCachedSource (pool.query) is called before any fetch in getVerifiedSource
    // and is not wrapped in a try/catch there. A pool failure propagates as a
    // plain Error through getVerifiedSource → the handler's catch sees it is
    // NOT an UpstreamError and re-throws it.
    (pool as unknown as { query: unknown }).query = async () => {
      throw new TypeError("pool connection refused");
    };

    await assert.rejects(
      () => getSourceCodeAction({ address: ADDR_SOURCECODE_RETHROW }),
      (err: unknown) => err instanceof TypeError,
    );
  });
});

// ===========================================================================
// getabi
// ===========================================================================

describe("contract.getabi — input validation", () => {
  for (const bad of INVALID_ADDRESSES) {
    it(`rejects address ${JSON.stringify(bad)}`, async () => {
      const res = await getAbiAction({ address: bad });
      assert.equal(res.status, "0");
      assert.equal(res.result, "Invalid Address format");
    });
  }
});

describe("contract.getabi — unverified address", () => {
  it("returns NOTOK with 'Contract source code not verified' when upstream returns null", async () => {
    stubNotFound();
    const res = await getAbiAction({ address: ADDR_ABI_NOTFOUND });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Contract source code not verified");
  });
});

describe("contract.getabi — empty ABI", () => {
  it("returns NOTOK when source exists but ABI is empty", async () => {
    stubBlockScoutSuccess({ ABI: "[]" });
    const res = await getAbiAction({ address: ADDR_ABI_EMPTY });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Contract source code not verified");
  });
});

describe("contract.getabi — verified address with ABI", () => {
  it("returns JSON-stringified ABI array on success", async () => {
    stubBlockScoutSuccess();
    const res = await getAbiAction({ address: ADDR_ABI_SUCCESS });
    assert.equal(res.status, "1");
    const result = res.result as string;
    // Result is a JSON string of the ABI array
    const abi = JSON.parse(result) as unknown[];
    assert.ok(Array.isArray(abi) && abi.length > 0, "ABI should be non-empty array");
    const entry = abi[0] as Record<string, unknown>;
    assert.equal(entry.name, "name");
  });
});

describe("contract.getabi — upstream error", () => {
  it("returns NOTOK message when UpstreamError is thrown", async () => {
    stubUpstreamError();
    const res = await getAbiAction({ address: ADDR_ABI_UPSTREAM });
    assert.equal(res.status, "0");
    assert.match(res.result as string, /temporarily unavailable/);
  });
});

describe("contract.getabi — non-UpstreamError propagates", () => {
  it("rethrows errors that are not UpstreamError", async () => {
    // Same mechanism as getsourcecode: pool.query is called before any fetch;
    // a pool failure is a plain Error that bypasses the UpstreamError guard.
    (pool as unknown as { query: unknown }).query = async () => {
      throw new RangeError("pool range error");
    };

    await assert.rejects(
      () => getAbiAction({ address: ADDR_ABI_RETHROW }),
      (err: unknown) => err instanceof RangeError,
    );
  });
});

// ===========================================================================
// verifysourcecode
// ===========================================================================

const VALID_STANDARD_JSON = JSON.stringify({
  language: "Solidity",
  sources: {
    "MyToken.sol": {
      content: "// SPDX-License-Identifier: MIT\ncontract MyToken {}",
    },
  },
  settings: { optimizer: { enabled: true, runs: 200 } },
});

describe("contract.verifysourcecode — input validation", () => {
  it("rejects an invalid contractaddress", async () => {
    const res = await verifySourceCodeAction({
      contractaddress: "bad",
      codeformat: "solidity-standard-json-input",
      sourceCode: VALID_STANDARD_JSON,
      compilerversion: "v0.8.20",
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });

  it("falls back to 'address' param when contractaddress is absent", async () => {
    const res = await verifySourceCodeAction({
      address: "bad",
      codeformat: "solidity-standard-json-input",
      sourceCode: VALID_STANDARD_JSON,
      compilerversion: "v0.8.20",
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Invalid Address format");
  });

  it("rejects wrong codeformat", async () => {
    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-single-file",
      sourceCode: VALID_STANDARD_JSON,
      compilerversion: "v0.8.20",
    });
    assert.equal(res.status, "0");
    assert.match(res.result as string, /solidity-standard-json-input/);
  });

  it("rejects missing sourceCode", async () => {
    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      compilerversion: "v0.8.20",
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Missing sourceCode");
  });

  it("rejects missing compilerversion", async () => {
    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: VALID_STANDARD_JSON,
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Missing compilerversion");
  });

  it("rejects malformed JSON in sourceCode", async () => {
    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: "{ invalid json {{{",
      compilerversion: "v0.8.20",
    });
    assert.equal(res.status, "0");
    assert.match(res.result as string, /not valid JSON/);
  });

  it("rejects standard JSON with empty sources object", async () => {
    const emptySourcesJson = JSON.stringify({
      language: "Solidity",
      sources: {},
    });
    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: emptySourcesJson,
      compilerversion: "v0.8.20",
    });
    assert.equal(res.status, "0");
    assert.match(res.result as string, /no source files/);
  });

  it("rejects standard JSON with sources that have no content field", async () => {
    const noContentJson = JSON.stringify({
      language: "Solidity",
      sources: {
        "Token.sol": { url: "https://example.com/Token.sol" },
      },
    });
    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: noContentJson,
      compilerversion: "v0.8.20",
    });
    assert.equal(res.status, "0");
    assert.match(res.result as string, /no source files/);
  });
});

describe("contract.verifysourcecode — happy path (Sourcify returns perfect match)", () => {
  it("stores result and returns a GUID on perfect match", async () => {
    stubSourcifySubmit({
      result: [
        {
          address: ADDR_VERIFY_VALID,
          chainId: "369",
          status: "perfect",
          storageTimestamp: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: VALID_STANDARD_JSON,
      compilerversion: "v0.8.20+commit.a1b79de6",
    });

    assert.equal(res.status, "1");
    const guid = res.result as string;
    assert.match(guid, /^[0-9a-f-]{36}$/, "result should be a UUID GUID");

    // The stored result is retrievable via checkverifystatus
    const stored = await checkVerifyStatusAction({ guid });
    assert.equal(stored.status, "1");
    assert.equal(stored.result, "Pass - Verified");
  });
});

describe("contract.verifysourcecode — happy path (Sourcify returns partial match)", () => {
  it("stores result and returns a GUID on partial match", async () => {
    stubSourcifySubmit({
      result: [{ address: ADDR_VERIFY_VALID, chainId: "369", status: "partial" }],
    });

    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: VALID_STANDARD_JSON,
      compilerversion: "v0.8.20",
    });

    assert.equal(res.status, "1");
    const guid = res.result as string;

    const stored = await checkVerifyStatusAction({ guid });
    assert.equal(stored.status, "1");
    assert.equal(stored.result, "Pass - Verified (partial)");
  });
});

describe("contract.verifysourcecode — Sourcify rejects submission", () => {
  it("stores failure and returns a GUID when Sourcify returns ok=false", async () => {
    stubSourcifySubmit(
      { result: [{ status: "error", message: "deployed bytecode does not match" }] },
      200,
    );

    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: VALID_STANDARD_JSON,
      compilerversion: "v0.8.20",
    });

    assert.equal(res.status, "1");
    const guid = res.result as string;

    const stored = await checkVerifyStatusAction({ guid });
    assert.equal(stored.status, "0");
    assert.match(stored.result as string, /Fail -/);
    assert.match(stored.result as string, /deployed bytecode does not match/);
  });
});

describe("contract.verifysourcecode — Sourcify upstream error", () => {
  it("returns etherscanErr when submitToSourcify throws UpstreamError", async () => {
    stubFetch(async (url) => {
      const u = String(url);
      if (u.includes("sourcify.dev") && u.includes("/verify")) {
        return makeFetchResponse({}, 503);
      }
      return makeFetchResponse({ status: "0", result: [] });
    });

    const res = await verifySourceCodeAction({
      contractaddress: ADDR_VERIFY_VALID,
      codeformat: "solidity-standard-json-input",
      sourceCode: VALID_STANDARD_JSON,
      compilerversion: "v0.8.20",
    });

    assert.equal(res.status, "0");
    assert.match(res.result as string, /Sourcify unavailable/);
  });
});

// Note: verifySourceCodeAction has a `throw err` catch-all for non-UpstreamError
// from submitToSourcify, but submitToSourcify itself wraps ALL thrown errors
// (fetch errors → UpstreamError; json parse errors → .catch(() => null)) so
// the re-throw path cannot be exercised via normal fetch stubbing. This is a
// dead code path in the current implementation — no test is written for it.

// ===========================================================================
// checkverifystatus
// ===========================================================================

describe("contract.checkverifystatus — missing guid", () => {
  it("returns etherscanErr for an empty guid param", async () => {
    const res = await checkVerifyStatusAction({ guid: "" });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Missing guid");
  });

  it("returns etherscanErr when guid param is absent", async () => {
    const res = await checkVerifyStatusAction({});
    assert.equal(res.status, "0");
    assert.equal(res.result, "Missing guid");
  });
});

describe("contract.checkverifystatus — unknown guid", () => {
  it("returns etherscanErr for a GUID not in the table", async () => {
    const res = await checkVerifyStatusAction({
      guid: "00000000-0000-0000-0000-000000000000",
    });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Unknown or expired guid");
  });
});

describe("contract.checkverifystatus — known GUIDs", () => {
  it("returns 'Pass - Verified' for a perfect match", async () => {
    const guid = storeVerifyResult({ kind: "pass", match: "perfect" });
    const res = await checkVerifyStatusAction({ guid });
    assert.equal(res.status, "1");
    assert.equal(res.result, "Pass - Verified");
  });

  it("returns 'Pass - Verified (partial)' for a partial match", async () => {
    const guid = storeVerifyResult({ kind: "pass", match: "partial" });
    const res = await checkVerifyStatusAction({ guid });
    assert.equal(res.status, "1");
    assert.equal(res.result, "Pass - Verified (partial)");
  });

  it("returns 'Fail - <error>' for a failed verification", async () => {
    const guid = storeVerifyResult({
      kind: "fail",
      error: "deployed bytecode does not match",
    });
    const res = await checkVerifyStatusAction({ guid });
    assert.equal(res.status, "0");
    assert.equal(res.result, "Fail - deployed bytecode does not match");
  });

  it("distinct GUIDs are resolved independently", async () => {
    const guidPass = storeVerifyResult({ kind: "pass", match: "perfect" });
    const guidFail = storeVerifyResult({ kind: "fail", error: "bytecode mismatch" });

    const passRes = await checkVerifyStatusAction({ guid: guidPass });
    const failRes = await checkVerifyStatusAction({ guid: guidFail });

    assert.equal(passRes.status, "1");
    assert.equal(failRes.status, "0");
  });
});
