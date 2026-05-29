/**
 * Unit tests for the hand-written OpenAPI spec.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { spec, errorResponse } from "../../../src/openapi/spec.js";

describe("openapi spec", () => {
  it("declares OpenAPI 3.1", () => {
    assert.equal(spec.openapi, "3.1.0");
  });

  it("reports the api package version", () => {
    assert.match(spec.info.version, /^\d+\.\d+\.\d+/);
  });

  it("declares the project's only security scheme (X-Api-Key)", () => {
    assert.deepEqual(Object.keys(spec.components.securitySchemes), ["apiKey"]);
    const s = spec.components.securitySchemes.apiKey;
    assert.ok(s, "apiKey securityScheme must be present");
    assert.equal(s.type, "apiKey");
    // TS doesn't narrow the union from .type without a custom guard;
    // explicit assertion + only-checked-once read after the assert.
    if (s.type === "apiKey") {
      assert.equal(s.in, "header");
      assert.equal(s.name, "X-Api-Key");
    }
  });

  it("lists production + local servers", () => {
    const urls = spec.servers.map((s) => s.url);
    assert.ok(urls.includes("https://explore.valve.city"), "should advertise the production URL");
    assert.ok(urls.includes("http://localhost:3030"), "should advertise the local URL");
  });

  it("describes the non-OpenAPI /rpc, /api/rpc, /ws/alerts surfaces in the appendix", () => {
    const desc = spec.info.description ?? "";
    assert.match(desc, /\/rpc/);
    assert.match(desc, /\/api\/rpc/);
    assert.match(desc, /\/ws\/alerts/);
  });

  it("calls out the federation link back to one.valve.city", () => {
    const desc = spec.info.description ?? "";
    assert.match(desc, /one\.valve\.city/);
  });

  it("covers the slice-1 /health route", () => {
    assert.ok(spec.paths["/health"]?.get, "GET /health should be documented");
  });
});

describe("errorResponse helper", () => {
  it("wraps a description in the standard { error: string } envelope", () => {
    const r = errorResponse("Bad input.");
    assert.equal(r.description, "Bad input.");
    const schema = r.content?.["application/json"]?.schema as {
      type: string;
      properties?: { error?: { type: string } };
      required?: readonly string[];
    };
    assert.equal(schema.type, "object");
    assert.equal(schema.properties?.error?.type, "string");
    assert.deepEqual(schema.required, ["error"]);
  });
});
