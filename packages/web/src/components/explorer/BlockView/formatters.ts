/**
 * Pure formatters for BlockView. The big-ticket extraction is
 * formatTimestamp, which previously closed over Date.now() inline — by
 * accepting `now` as an injected parameter (defaulting to Date.now() for
 * the production call site) the bucket boundaries (60s, 1h, 1d) become
 * unit-testable without time-mocking.
 */

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format a unix-seconds block timestamp as
 * `YYYY-MM-DD HH:MM:SS UTC (Xs/m/h/d ago)`. The relative-time suffix
 * uses the same coarse bucket scheme block explorers conventionally
 * show: seconds under a minute, minutes under an hour, hours under a
 * day, then days.
 *
 * @param ts unix seconds (block.timestamp from JSON-RPC)
 * @param now optional injected current time in unix millis (test seam)
 */
export function formatTimestamp(ts: number, now: number = Date.now()): string {
  const d = new Date(ts * 1000);
  const agoSec = Math.floor((now - d.getTime()) / 1000);
  return `${formatIsoUtc(d)} (${formatAgo(agoSec)})`;
}

/**
 * Bucket a seconds-ago duration into the explorer's relative-time
 * label. Negative inputs (timestamp in the future, e.g. clock skew)
 * are clamped to "0s ago" rather than rendering "-5s ago".
 */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < MINUTE) return `${s}s ago`;
  if (s < HOUR) return `${Math.floor(s / MINUTE)}m ago`;
  if (s < DAY) return `${Math.floor(s / HOUR)}h ago`;
  return `${Math.floor(s / DAY)}d ago`;
}

/**
 * Render a Date as `YYYY-MM-DD HH:MM:SS UTC` (replacing the ISO 'T'
 * separator and 'Z' suffix). Splits out from formatTimestamp so the
 * relative-time + absolute-time concerns are testable separately.
 */
export function formatIsoUtc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", " UTC");
}
