/**
 * Branding for the OpenAPI doc + Scalar reference page. Env-driven so a
 * self-hosted instance doesn't advertise `explore.valve.city` — set
 * `PUBLIC_BASE_URL`, `OPENAPI_TITLE`, `OPENAPI_CONTACT_EMAIL` to your own.
 * Defaults reproduce the hosted deployment exactly.
 */

/** Public URL this instance is reached at — the primary OpenAPI server. */
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || "https://explore.valve.city";

/** OpenAPI `info.title` + the docs page `<title>`. */
export const BRAND_TITLE =
  process.env.OPENAPI_TITLE || "valve · explore.valve.city";

/** OpenAPI `info.contact.email`. */
export const CONTACT_EMAIL =
  process.env.OPENAPI_CONTACT_EMAIL || "dev@valve.city";

/** Local dev server URL, using the configured API port. */
export const LOCAL_SERVER_URL = `http://localhost:${process.env.PORT || "10100"}`;
