import type { TraceResult } from "../types.js";
import { describeUnknownError } from "../util/errors.js";
import { loadTraceFromObject, type LoadObjectInput } from "./loadTraceFromObject.js";

/**
 * Load a trace from a JSON string (e.g. a file the consumer has read). The
 * JSON should match the LoadObjectInput shape: an object with `callFrame` and
 * optionally `structLogs`, `txHash`, `blockNumber`. Throws on invalid JSON or
 * missing `callFrame`.
 *
 * We accept a string rather than a path so the SDK stays node/browser-agnostic
 * — consumers can use `fs.readFile`, `fetch`, or anything that produces JSON.
 */
export function loadTraceFromFile(json: string): TraceResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `loadTraceFromFile: invalid JSON — ${describeUnknownError(err)}`,
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("callFrame" in parsed)
  ) {
    throw new Error(
      "loadTraceFromFile: expected object with `callFrame` field",
    );
  }

  return loadTraceFromObject(parsed as LoadObjectInput);
}
