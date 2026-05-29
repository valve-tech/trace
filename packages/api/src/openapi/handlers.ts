/**
 * Express handlers for the OpenAPI surface:
 *   - GET /openapi.json  →  the spec, JSON. CORS open so off-host docs
 *                           editors can fetch.
 *   - GET /docs          →  Scalar UI bootstrap that fetches
 *                           /openapi.json on load.
 *
 * Mirror of the monorepo's packages/api/src/openapi/handlers.ts —
 * same Scalar version pin, same cache TTLs, same CORS policy.
 */

import type { Request, Response } from "express";

import { spec } from "./spec.js";

const SPEC_JSON = JSON.stringify(spec, null, 2);

const SCALAR_VERSION = "1.25.96";
const SCALAR_SRC = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.min.js`;

const DOCS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>valve · explore.valve.city — API reference</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      body { margin: 0; background: #0b0b0d; color: #e5e7eb; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    </style>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json" data-configuration='{"theme":"deepSpace","layout":"modern","showSidebar":true,"hideClientButton":false}'></script>
    <script src="${SCALAR_SRC}" crossorigin="anonymous"></script>
  </body>
</html>
`;

export const openapiJsonHandler = (_req: Request, res: Response): void => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.type("application/json").send(SPEC_JSON);
};

export const docsHandler = (_req: Request, res: Response): void => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("text/html").send(DOCS_HTML);
};
