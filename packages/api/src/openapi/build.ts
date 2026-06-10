/**
 * Build step: serializes the hand-written spec into `dist/openapi.json`.
 * Wired into packages/api's build via the package.json `build` script.
 *
 * The runtime mounts read directly from the spec module (same byte-for-byte
 * content via JSON.stringify); this artifact is for offline consumers and CI.
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { spec } from "./spec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "..", "openapi.json");

const json = JSON.stringify(spec, null, 2) + "\n";
writeFileSync(OUTPUT, json, { encoding: "utf-8" });

console.log(
  `[openapi] wrote ${OUTPUT} (${json.length} bytes, ${Object.keys(spec.paths).length} paths)`,
);
