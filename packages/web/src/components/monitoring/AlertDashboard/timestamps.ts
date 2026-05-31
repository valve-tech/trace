/**
 * Server-side timestamp encoding for the alert dashboard. The backend
 * stores `timestamp without time zone` in Postgres and serializes it
 * via the default driver, which produces an ISO-shaped string WITHOUT
 * the trailing `Z`. The contract here is therefore:
 *
 *   serializeFromDate(new Date(...)) → "2026-05-30T22:00:00.000"
 *   parseServerTimestamp("2026-05-30T22:00:00.000") → equivalent Date
 *
 * Both helpers assume server values are UTC (which the Postgres column
 * implicitly is, per backend convention). If the column ever migrates
 * to `timestamp with time zone`, the parse helper's `+ "Z"` will
 * double up and produce Invalid Date — tests below pin down the shape
 * so that migration becomes loud, not silent.
 */

/**
 * Parse a server-format timestamp string ("YYYY-MM-DDTHH:MM:SS.sss",
 * no trailing Z) as a UTC Date. Appends `Z` so the JS Date constructor
 * doesn't interpret the input as local time.
 */
export function parseServerTimestamp(s: string): Date {
  return new Date(s + "Z");
}

/**
 * Serialize a Date as the server's expected ISO-without-Z shape. Used
 * when the WebSocket layer constructs a synthetic Alert record locally
 * (so the row card has a `last_triggered_at` to display before the
 * next fetch round-trip catches up).
 */
export function serializeServerTimestamp(d: Date): string {
  return d.toISOString().replace("Z", "");
}
