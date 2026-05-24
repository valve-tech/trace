/**
 * Loads the repo-root `.env` regardless of process cwd.
 *
 * `import "dotenv/config"` reads `./.env` relative to cwd, but the dev server
 * runs with cwd = `packages/api` (npm workspace script) where no `.env`
 * exists — so the root `.env` was silently never loaded and the API ran on
 * code defaults (public RPC). Resolving the path relative to this module
 * fixes that for both dev (`src/`) and the build (`dist/`), each one level
 * under `packages/api`.
 *
 * Must be the FIRST import in index.ts so process.env is populated before any
 * service module reads it at load time. dotenv does NOT override already-set
 * vars, so a containerized deployment (env injected by docker-compose /
 * Railway, no root `.env` present) is unaffected — the file is simply absent
 * and config() no-ops.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });
