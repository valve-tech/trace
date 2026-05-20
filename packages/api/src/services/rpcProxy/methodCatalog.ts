import type { MethodDescription } from "./types.js";
import { STANDARD_METHODS } from "./standardMethods.js";
import { VALVE_METHODS } from "./valveMethods.js";

/**
 * Aggregate every documented method into one array for the
 * `/api/rpc/methods` endpoint and the UI playground. Ordering preserves
 * "standard first, custom second" so consumers can render the upstream
 * surface before the Valve extensions.
 */
export function getSupportedMethods(): MethodDescription[] {
  return [...STANDARD_METHODS, ...VALVE_METHODS];
}
