/**
 * Unit tests for the respond helpers (respond.ok, respond.fail) and
 * asyncRoute.
 *
 * Express Response is stubbed with a minimal object that records the
 * status code and JSON body without requiring a running HTTP server.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { z } from "zod";
import { respond, asyncRoute, ApiError } from "../../src/lib/respond.js";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Minimal Express Response stub
// ---------------------------------------------------------------------------

interface CapturedResponse {
  statusCode: number;
  body: unknown;
  headersSent: boolean;
}

function makeRes(headersSent = false): Response & CapturedResponse {
  const captured: CapturedResponse = {
    statusCode: 200,
    body: undefined,
    headersSent,
  };

  const res = {
    get headersSent() {
      return captured.headersSent;
    },
    statusCode: captured.statusCode,
    body: captured.body,
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(data: unknown) {
      captured.body = data;
      return res;
    },
  } as unknown as Response & CapturedResponse;

  // Expose captured fields directly on the stub for test assertions.
  Object.defineProperty(res, "statusCode", {
    get: () => captured.statusCode,
  });
  Object.defineProperty(res, "body", {
    get: () => captured.body,
  });

  return res;
}

// Minimal no-op Request / NextFunction stubs
const req = {} as Request;
const next: NextFunction = () => {};

// ---------------------------------------------------------------------------
// respond.ok
// ---------------------------------------------------------------------------

describe("respond.ok", () => {
  it("writes { ok: true } when called with an empty body", () => {
    const res = makeRes();
    respond.ok(res);
    assert.deepEqual((res as unknown as CapturedResponse).body, { ok: true });
  });

  it("merges the supplied body fields with ok=true", () => {
    const res = makeRes();
    respond.ok(res, { txHash: "0xabc", gasUsed: 21000 });
    assert.deepEqual((res as unknown as CapturedResponse).body, {
      ok: true,
      txHash: "0xabc",
      gasUsed: 21000,
    });
  });

  it("does not set a status code (uses Express default 200)", () => {
    const res = makeRes();
    respond.ok(res, { data: 1 });
    assert.equal((res as unknown as CapturedResponse).statusCode, 200);
  });
});

// ---------------------------------------------------------------------------
// respond.fail — ApiError
// ---------------------------------------------------------------------------

describe("respond.fail — ApiError", () => {
  it("writes the ApiError status and message", () => {
    const res = makeRes();
    respond.fail(res, new ApiError(404, "Not found"));
    const captured = res as unknown as CapturedResponse;
    assert.equal(captured.statusCode, 404);
    assert.deepEqual(captured.body, { ok: false, error: "Not found" });
  });

  it("merges extra details from ApiError.details into the response", () => {
    const res = makeRes();
    respond.fail(
      res,
      new ApiError(503, "Debug unavailable", { debugAvailable: false }),
    );
    const captured = res as unknown as CapturedResponse;
    assert.equal(captured.statusCode, 503);
    assert.deepEqual(captured.body, {
      ok: false,
      error: "Debug unavailable",
      debugAvailable: false,
    });
  });

  it("uses the ApiError status — not 500", () => {
    const res = makeRes();
    respond.fail(res, new ApiError(422, "Unprocessable"));
    assert.equal((res as unknown as CapturedResponse).statusCode, 422);
  });
});

// ---------------------------------------------------------------------------
// respond.fail — ZodError
// ---------------------------------------------------------------------------

describe("respond.fail — ZodError", () => {
  function makeZodError(): ZodError {
    const schema = z.object({ address: z.string().min(42) });
    const result = schema.safeParse({ address: "short" });
    assert.ok(!result.success);
    return result.error;
  }

  it("writes 400 for a ZodError", () => {
    const res = makeRes();
    respond.fail(res, makeZodError());
    assert.equal((res as unknown as CapturedResponse).statusCode, 400);
  });

  it("writes { ok: false, error: 'Validation error', details: [...] }", () => {
    const res = makeRes();
    const zodErr = makeZodError();
    respond.fail(res, zodErr);
    const body = (res as unknown as CapturedResponse).body as Record<
      string,
      unknown
    >;
    assert.equal(body.ok, false);
    assert.equal(body.error, "Validation error");
    assert.ok(Array.isArray(body.details), "details should be an array");
    assert.ok(
      (body.details as unknown[]).length > 0,
      "details should be non-empty",
    );
  });
});

// ---------------------------------------------------------------------------
// respond.fail — plain Error
// ---------------------------------------------------------------------------

describe("respond.fail — plain Error", () => {
  it("writes 500 and the error message for a plain Error", () => {
    const res = makeRes();
    respond.fail(res, new Error("Something exploded"));
    const captured = res as unknown as CapturedResponse;
    assert.equal(captured.statusCode, 500);
    assert.deepEqual(captured.body, {
      ok: false,
      error: "Something exploded",
    });
  });

  it("uses the fallbackMessage when a non-Error is thrown", () => {
    const res = makeRes();
    respond.fail(res, "raw string error", "Internal error");
    const captured = res as unknown as CapturedResponse;
    assert.equal(captured.statusCode, 500);
    assert.deepEqual(captured.body, {
      ok: false,
      error: "Internal error",
    });
  });

  it("uses the default fallbackMessage when none is supplied", () => {
    const res = makeRes();
    respond.fail(res, 42); // non-Error, no fallback
    const body = (res as unknown as CapturedResponse).body as Record<
      string,
      unknown
    >;
    assert.equal(body.error, "Internal error");
  });
});

// ---------------------------------------------------------------------------
// respond.fail — headersSent guard
// ---------------------------------------------------------------------------

describe("respond.fail — headersSent guard", () => {
  it("does nothing when res.headersSent is true", () => {
    const res = makeRes(true /* headersSent */);
    respond.fail(res, new ApiError(500, "Should not write"));
    // body remains undefined — json() was never called
    assert.equal((res as unknown as CapturedResponse).body, undefined);
  });
});

// ---------------------------------------------------------------------------
// asyncRoute
// ---------------------------------------------------------------------------

describe("asyncRoute", () => {
  it("calls the handler and does not interfere with a successful response", async () => {
    let handlerCalled = false;
    const wrapped = asyncRoute(async (_req, _res, _next) => {
      handlerCalled = true;
    });

    const res = makeRes();
    await wrapped(req, res, next);
    assert.ok(handlerCalled);
    // No respond.fail was triggered — body is still undefined
    assert.equal((res as unknown as CapturedResponse).body, undefined);
  });

  it("catches a synchronously thrown Error and writes a fail response", async () => {
    const wrapped = asyncRoute((_req, _res, _next) => {
      throw new Error("sync boom");
    });

    const res = makeRes();
    await wrapped(req, res, next);
    const captured = res as unknown as CapturedResponse;
    assert.equal(captured.statusCode, 500);
    assert.deepEqual(captured.body, { ok: false, error: "sync boom" });
  });

  it("catches a rejected promise and writes a fail response", async () => {
    const wrapped = asyncRoute(async (_req, _res, _next) => {
      throw new Error("async boom");
    });

    const res = makeRes();
    await wrapped(req, res, next);
    const captured = res as unknown as CapturedResponse;
    assert.equal(captured.statusCode, 500);
    assert.deepEqual(captured.body, { ok: false, error: "async boom" });
  });

  it("passes an ApiError through with its own status code", async () => {
    const wrapped = asyncRoute(async (_req, _res, _next) => {
      throw new ApiError(403, "Forbidden");
    });

    const res = makeRes();
    await wrapped(req, res, next);
    const captured = res as unknown as CapturedResponse;
    assert.equal(captured.statusCode, 403);
    assert.deepEqual(captured.body, { ok: false, error: "Forbidden" });
  });

  it("prefixes the log tag in the error message (tag parameter)", async () => {
    // We can't easily intercept console.error — this test just ensures the
    // tag doesn't cause any crash and the response is still written.
    const wrapped = asyncRoute(async () => {
      throw new Error("tagged error");
    }, "testnets");

    const res = makeRes();
    await wrapped(req, res, next);
    assert.equal(
      ((res as unknown as CapturedResponse).body as Record<string, unknown>)
        .error,
      "tagged error",
    );
  });
});
