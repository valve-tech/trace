/**
 * Integration-style tests for the OpenAPI handlers. Mounts the handlers
 * onto a thin Express app — no Postgres, no monitor, no background
 * services — and asserts the contract integrators rely on.
 */

import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { docsHandler, openapiJsonHandler } from "../../../src/openapi/handlers.js";

let app: Express;
let server: Server;
let baseUrl: string;

before(async () => {
  app = express();
  app.get("/openapi.json", openapiJsonHandler);
  app.get("/docs", docsHandler);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

describe("GET /openapi.json", () => {
  it("returns the spec as application/json", async () => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const body = await res.json() as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };
    assert.equal(body.openapi, "3.1.0");
    assert.match(body.info.title, /valve/);
    assert.ok(body.paths["/health"], "slice-1 /health route should be present");
  });

  it("opens CORS so off-host docs editors can fetch", async () => {
    // The federation contract requires `Access-Control-Allow-Origin: *`
    // on the spec so a docs editor hosted at one.valve.city/docs (or a
    // local Scalar editor) can pull it without server-side proxying.
    const res = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });

  it("declares cache headers so CDN/edge can cache between deploys", async () => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    assert.match(res.headers.get("cache-control") ?? "", /max-age=\d+/);
  });
});

describe("GET /docs", () => {
  it("returns the Scalar UI bootstrap as text/html", async () => {
    const res = await fetch(`${baseUrl}/docs`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const body = await res.text();
    // The bootstrap script must wire to /openapi.json so the docs page
    // and the machine-readable spec stay byte-identical sources of truth.
    assert.ok(body.includes('data-url="/openapi.json"'));
    // And it must actually load Scalar — guards against a future
    // refactor that strips the bootstrap script accidentally.
    assert.ok(body.includes("@scalar/api-reference"));
  });
});
