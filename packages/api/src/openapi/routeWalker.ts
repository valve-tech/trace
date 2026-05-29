/**
 * Walk an Express 4 router tree and collect every (method, path) tuple
 * it would handle. Used by drift.test.ts to assert that every live
 * route is either documented in spec.paths or explicitly allow-listed.
 *
 * Mirror of the monorepo's packages/api/src/openapi/routeWalker.ts;
 * Express internals are identical. If Express 5 breaks the shape, this
 * file is the only place that needs updating (both repos).
 */

import type { Router, Express } from "express";

export interface DiscoveredRoute {
  method: string;
  path: string;
}

interface ExpressLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
  name?: string;
  handle?: { stack?: ExpressLayer[] };
  regexp: RegExp;
}

/**
 * Decode the mount prefix from an Express mount-layer regexp.
 *
 * Express builds these as `/^\/api\/?(?=\/|$)/i` — strip the
 * boilerplate and unescape the slashes. "Mounted at /" decodes to "".
 */
const mountPrefix = (regexp: RegExp): string => {
  const src = regexp.source;
  const match = src.match(/^\\?\^(.*?)\\\/\?\(\?=\\\/\|\$\)$/);
  if (!match || match[1] === undefined) return "";
  return match[1].replace(/\\\//g, "/");
};

/**
 * Recursively walk a router's stack and return mount-prefixed routes.
 * Accepts an Express app or a Router. Methods are lowercased to match
 * OpenAPI PathItemObject key conventions.
 */
export const walkRouter = (
  router: Router | Express,
  prefix: string = "",
): DiscoveredRoute[] => {
  // Express 4's `app._router.stack` and `Router.stack` share shape.
  const innerStack =
    (router as unknown as { _router?: { stack?: ExpressLayer[] } })._router?.stack ??
    (router as unknown as { stack?: ExpressLayer[] }).stack ??
    [];
  const out: DiscoveredRoute[] = [];
  for (const layer of innerStack) {
    if (layer.route) {
      const path = prefix + layer.route.path;
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) {
          out.push({ method: method.toLowerCase(), path });
        }
      }
      continue;
    }
    if (layer.name === "router" && layer.handle?.stack) {
      const subPrefix = prefix + mountPrefix(layer.regexp);
      out.push(...walkRouter(layer.handle as unknown as Router, subPrefix));
    }
  }
  return out;
};
