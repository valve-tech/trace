import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SOLC_CACHE_DIR = path.join(os.tmpdir(), "solc-cache");

/**
 * Strip the `v` prefix, build metadata, and pre-release suffix to get a
 * clean `X.Y.Z` solc version string. Throws on malformed input so we
 * fail fast rather than passing nonsense to the downloader.
 */
export function sanitizeVersion(raw: string): string {
  const clean = raw
    .replace(/^v/, "")
    .replace(/\+.*$/, "")
    .replace(/-.*$/, "");
  if (!/^\d+\.\d+\.\d+$/.test(clean)) {
    throw new Error(`Invalid compiler version: ${raw}`);
  }
  return clean;
}

/**
 * Return a path to a runnable `solc` binary for the requested version,
 * downloading and caching on first use. Tries the official GitHub release
 * (native binary, fastest) and falls back to a `npx solc@<version>`
 * wrapper script — slower but works on any platform since npm always
 * resolves the JS build.
 */
export async function getSolcBinary(version: string): Promise<string> {
  fs.mkdirSync(SOLC_CACHE_DIR, { recursive: true });
  const binaryPath = path.join(SOLC_CACHE_DIR, `solc-${version}`);

  if (fs.existsSync(binaryPath)) return binaryPath;

  const platform =
    process.platform === "darwin" ? "macosx-amd64" : "linux-amd64";
  const nativeUrl = `https://github.com/ethereum/solidity/releases/download/v${version}/solc-${platform}`;

  try {
    console.log(`[solc] downloading native solc ${version}...`);
    const res = await fetch(nativeUrl, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(binaryPath, buffer);
      fs.chmodSync(binaryPath, 0o755);
      return binaryPath;
    }
  } catch {
    // Native binary not available for this platform/version — fall through.
  }

  console.log(`[solc] native binary not available, using solcjs wrapper`);
  const wrapperPath = path.join(
    SOLC_CACHE_DIR,
    `solc-wrapper-${version}.sh`,
  );
  fs.writeFileSync(
    wrapperPath,
    `#!/bin/bash\nnpx solc@${version} "$@"\n`,
    "utf-8",
  );
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}
