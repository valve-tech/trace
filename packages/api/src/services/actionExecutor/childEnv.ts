import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repo-root path passed to the child via `--allow-fs-read`. Computed once
 * at module load by walking up from this file (which lives at
 * `<repo>/packages/api/(src|dist)/services/actionExecutor`).
 *
 * The fs-read grant is repo-wide so Node can resolve modules — user code
 * can read source files but cannot read `.env` (which is filtered out of
 * the child env block via the allow-list below).
 */
export const REPO_ROOT = (() => {
  // dirname(this file) → packages/api/(src|dist)/services/actionExecutor
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "..", "..");
})();

/** Hard upper bound for a single action invocation. */
export const TIMEOUT_MS = 30_000;

/**
 * Env vars the child receives. Everything else is dropped before spawn so
 * Postgres credentials, API keys, private RPC URLs, etc. don't bleed
 * into user code. PATH is required for Node's binary resolution;
 * NODE_OPTIONS is retained to support tooling-set flags.
 */
const ALLOWED_ENV_VARS: ReadonlySet<string> = new Set(["NODE_OPTIONS", "PATH"]);

export function filteredEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of ALLOWED_ENV_VARS) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
