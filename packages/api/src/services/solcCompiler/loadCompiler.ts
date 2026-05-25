import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import solc from "solc";

const require = createRequire(import.meta.url);

// soljson builds are ~8MB each; cache to disk so the download is once-per-host,
// and keep the wrapped compiler in memory once-per-version-per-process.
const CACHE_DIR = path.join(os.tmpdir(), "solc-soljson-cache");
const compilers = new Map<string, SolcCompiler>();

/** The subset of the solc-js wrapper we use. */
export interface SolcCompiler {
  compile(input: string): string;
}

interface BinList {
  releases: Record<string, string>; // "0.6.6" -> "soljson-v0.6.6+commit.6c089d02.js"
}

let binListPromise: Promise<BinList> | null = null;
function fetchBinList(): Promise<BinList> {
  binListPromise ??= fetch("https://binaries.soliditylang.org/bin/list.json", {
    signal: AbortSignal.timeout(20_000),
  }).then((r) => {
    if (!r.ok) throw new Error(`solc bin list fetch failed: ${r.status}`);
    return r.json() as Promise<BinList>;
  });
  return binListPromise;
}

/**
 * Normalize a verified contract's `compilerVersion` to the long soljson form
 * ("v0.6.6+commit.6c089d02"). BlockScout usually reports the full form already;
 * when only "0.6.6" is known, resolve the canonical build from the bin list.
 */
export async function resolveFullVersion(compilerVersion: string): Promise<string> {
  const v = compilerVersion.startsWith("v") ? compilerVersion : `v${compilerVersion}`;
  if (/^v\d+\.\d+\.\d+\+commit\.[0-9a-f]+$/.test(v)) return v;

  const short = v.match(/^v(\d+\.\d+\.\d+)/)?.[1];
  if (!short) throw new Error(`Invalid compiler version: ${compilerVersion}`);
  const list = await fetchBinList();
  const file = list.releases[short];
  if (!file) throw new Error(`No solc build published for ${short}`);
  return file.replace(/^soljson-/, "").replace(/\.js$/, "");
}

/**
 * Load (and cache) the solc-js compiler for a given long version. Uses the
 * library's `setupMethods` over a downloaded soljson module — pure JS, so it
 * works on every platform and arch, unlike the GitHub native binaries that
 * aren't published for macOS / old versions.
 */
export async function getCompiler(fullVersion: string): Promise<SolcCompiler> {
  const cached = compilers.get(fullVersion);
  if (cached) return cached;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `soljson-${fullVersion}.js`);

  if (!fs.existsSync(file)) {
    const url = `https://binaries.soliditylang.org/bin/soljson-${fullVersion}.js`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`soljson download failed (${res.status}): ${fullVersion}`);
    // Write atomically — a half-written soljson would poison the cache.
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(tmp, file);
  }

  const soljson = require(file) as unknown;
  const compiler = solc.setupMethods(soljson) as SolcCompiler;
  compilers.set(fullVersion, compiler);
  return compiler;
}
