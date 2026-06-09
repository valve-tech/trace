/**
 * Branding for the OpenAPI doc + Scalar reference page. Env-driven so a
 * self-hosted instance doesn't advertise `explore.valve.city` — set
 * `PUBLIC_BASE_URL`, `OPENAPI_TITLE`, `OPENAPI_CONTACT_EMAIL`, `OPENAPI_BRAND`,
 * `OPENAPI_FEDERATION_URL` to your own. Defaults reproduce the hosted
 * deployment exactly.
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

/** Platform name used in the OpenAPI prose appendix (e.g. "Explore"). */
export const BRAND_NAME = process.env.OPENAPI_BRAND || "Explore";

/** Host portion of PUBLIC_BASE_URL, for prose that names this instance. */
export const PUBLIC_HOST = (() => {
  try {
    return new URL(PUBLIC_BASE_URL).host;
  } catch {
    return PUBLIC_BASE_URL;
  }
})();

/**
 * OpenAPI federation manifest root. Defaults to valve's discovery root so the
 * hosted deployment is unchanged; set `OPENAPI_FEDERATION_URL=""` to drop the
 * federation section entirely (a self-host that isn't part of any federation).
 * `??` (not `||`) so an explicit empty string is honored as "omit".
 */
export const FEDERATION_MANIFEST_URL =
  process.env.OPENAPI_FEDERATION_URL ?? "https://one.valve.city/";
