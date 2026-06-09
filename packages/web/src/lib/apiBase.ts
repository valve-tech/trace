/**
 * Backend origin resolution for API + WebSocket calls.
 *
 * The default is SAME-ORIGIN (empty base): on `explore.valve.city` the SPA and
 * the backend share an origin, and the Vite dev proxy forwards `/api`, `/rpc`,
 * `/ws` to :10100 — both work with a bare path, unchanged.
 *
 * An ABSOLUTE origin is only needed when the bundle is served from somewhere
 * that ISN'T the backend — i.e. an IPFS gateway (`/ipfs/<CID>/`). The IPFS
 * build bakes `VITE_API_BASE=https://explore.valve.city` so the gateway-served
 * UI still talks to our backend.
 *
 * Per the Phase-2 IPFS spec (2026-06-01):
 *   - build-time default via `VITE_API_BASE` (recommendation A)
 *   - per-browser override via localStorage (recommendation B)
 *   - the `?api=` query-string override is DELIBERATELY NOT supported
 *     (recommendation C, dropped): same UI + attacker-chosen backend in a
 *     shareable link is a phishing vector.
 */

/** localStorage key for the user's optional backend override (Settings panel). */
export const API_BASE_OVERRIDE_KEY = "explore:apiBase";

/**
 * Only http(s) absolute origins are accepted as an override. Rejects
 * `javascript:`/`data:` and relative junk so a poisoned localStorage value
 * can't redirect API traffic to a script URL. Returns the normalized origin
 * (no trailing slash) or null.
 */
export function sanitizeApiBase(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin;
}

/**
 * Resolve the backend origin. Priority:
 *   1. validated localStorage override (user opted in via Settings)
 *   2. build-time VITE_API_BASE (the IPFS bundle's baked default)
 *   3. same-origin (empty string) — canonical site + dev proxy
 */
export function resolveApiBase(): string {
  const override =
    typeof localStorage !== "undefined"
      ? sanitizeApiBase(localStorage.getItem(API_BASE_OVERRIDE_KEY))
      : null;
  if (override) return override;

  const baked = sanitizeApiBase(import.meta.env.VITE_API_BASE);
  if (baked) return baked;

  return "";
}

/** Build an absolute (or same-origin) URL for an API/RPC path like `/api/foo`. */
export function apiUrl(path: string): string {
  const base = resolveApiBase();
  return base ? base + path : path;
}

/**
 * Build a ws(s):// URL for a backend WebSocket path like `/ws/alerts`.
 * Derives host + scheme from the resolved API base; falls back to the current
 * page origin when same-origin (canonical site / dev).
 */
export function wsUrl(path: string): string {
  const base = resolveApiBase();
  if (base) {
    const u = new URL(base);
    const scheme = u.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${u.host}${path}`;
  }
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}${path}`;
}
