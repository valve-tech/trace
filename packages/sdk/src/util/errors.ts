/**
 * Format an unknown thrown value into a human-readable string. Extracted
 * from inline catch-block expressions so the branches can be tested directly:
 * the `String(err)` path is unreachable when callers like `JSON.parse` only
 * ever throw `Error` subclasses, but the helper itself can be invoked with
 * any value.
 */
export function describeUnknownError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
