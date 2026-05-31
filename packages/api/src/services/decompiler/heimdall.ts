import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cacheDecompilation, getCachedDecompilation } from "./cache.js";
import { extractStorageSlots } from "./parseDecompiled.js";
import type { KnownSlot } from "./knownSlots.js";

const execFileAsync = promisify(execFile);

/**
 * Heimdall-rs integration. Heimdall is a Rust binary that decompiles
 * EVM bytecode into Solidity-like source, infers ABI, and analyzes
 * storage access patterns. We shell out to it because there's no
 * native JS port — the trade-off is a system dep (install via
 * `bifrost -t nightly` or `cargo install heimdall-rs`) instead of an
 * npm dep, but the alternative is reinventing a non-trivial analyzer.
 *
 * The integration is OPTIONAL: when heimdall isn't on PATH (dev
 * environments without it, or a misconfigured prod), we return null
 * and the caller surfaces a friendly degradation message instead of
 * crashing. The Dockerfile in prod installs heimdall via the same
 * bifrost script.
 *
 * Output schema is heimdall's own — we parse the JSON it writes to
 * disk (heimdall doesn't have a "print JSON to stdout" mode for the
 * decompile command, so we redirect output to a temp file).
 *
 * Reference: https://github.com/Jon-Becker/heimdall-rs
 */

/**
 * Per-slot storage access entry derived from heimdall's decompiled
 * Solidity output. Heimdall renders storage reads/writes inline as
 * `storage[<slot>]`; we scan the source for those references and
 * cross-reference against the known proxy-pattern registry.
 *
 * `name` is null today (heimdall doesn't emit slot-name suggestions in
 * its current output), reserved so the frontend can render the field
 * unconditionally without a layout shift if name inference lands later.
 */
export interface DecompiledStorageSlot {
  /** Hex slot value, 0x-prefixed, zero-padded to 64 chars. */
  slot: string;
  /** Inferred type, when heimdall could narrow it. Today: always null. */
  inferredType: string | null;
  /** "read" / "write" — observed access kinds for this slot in the decompiled source. */
  access: ("read" | "write")[];
  /** Heimdall-inferred name (reserved; null today). */
  name: string | null;
  /** Match against the well-known proxy/upgradeable slot registry. */
  known: KnownSlot | null;
  /** Count of distinct storage[] references that landed on this slot. */
  hitCount: number;
}

export interface DecompiledContract {
  /** Whether heimdall found a non-trivial layout. */
  hasLayout: boolean;
  /** Inferred storage slots (read+write patterns). */
  slots: DecompiledStorageSlot[];
  /** Pseudo-Solidity source produced by heimdall, when available. */
  pseudoSource: string | null;
  /** Inferred ABI (function selectors + tentative names). */
  inferredAbi: unknown[] | null;
}

/**
 * Probe whether heimdall is available on PATH. Memoized for the
 * lifetime of the process — heimdall doesn't get installed / removed
 * mid-session. Returns the reported version string when present, or
 * null when absent / unavailable.
 */
let _versionCache: string | null | undefined = undefined;
export async function heimdallVersion(): Promise<string | null> {
  if (_versionCache !== undefined) return _versionCache;
  try {
    const { stdout } = await execFileAsync("heimdall", ["--version"], {
      timeout: 3_000,
    });
    _versionCache = stdout.trim() || "unknown";
  } catch {
    _versionCache = null;
  }
  return _versionCache;
}

export async function heimdallAvailable(): Promise<boolean> {
  return (await heimdallVersion()) !== null;
}

/**
 * For testing: reset the memoized availability flag so a test can
 * exercise both the heimdall-present and heimdall-missing paths.
 */
export function resetHeimdallAvailabilityCache(): void {
  _versionCache = undefined;
}

/**
 * Decompile a contract's deployed bytecode via heimdall, returning the
 * inferred storage layout + ABI + pseudo-source. Returns null when
 * heimdall isn't installed, when the bytecode is empty (EOA), or when
 * heimdall failed (timeout, crash) — caller falls back to the existing
 * verified-source-required behavior.
 *
 * Bytecode must include the 0x prefix or be a raw hex string.
 */
export async function decompileWithHeimdall(
  bytecode: string,
  opts: { timeoutMs?: number; skipCache?: boolean } = {},
): Promise<DecompiledContract | null> {
  const hex = bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`;
  if (hex.length < 4) return null; // empty / EOA

  // Cache check FIRST — heimdall takes 10-30s per call, so the read
  // path needs to short-circuit on a cache hit even when heimdall
  // isn't installed. Cached rows are still valid; the operator may
  // have installed heimdall to populate them then uninstalled.
  if (!opts.skipCache) {
    try {
      const cached = await getCachedDecompilation(hex);
      if (cached) return cached;
    } catch (err) {
      // Postgres unavailable / migration not run — degrade to a fresh
      // call rather than failing the whole request.
      console.warn(
        `[heimdall] cache lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!(await heimdallAvailable())) return null;

  const timeout = opts.timeoutMs ?? 60_000;
  const workDirName = `heimdall-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workDir = join(tmpdir(), workDirName);
  await mkdir(workDir, { recursive: true });

  const startedAt = Date.now();
  try {
    const bytecodeFile = join(workDir, "bytecode.txt");
    await writeFile(bytecodeFile, hex, "utf8");

    // Flags rationale:
    //   --include-sol   — emit human-readable Solidity (storage refs live here)
    //   --skip-resolving — don't hit a 4byte registry for selectors; we don't
    //                     need names and it cuts ~10s per call
    //   --default       — auto-pick defaults on any prompt so the process
    //                     never blocks on stdin
    //   --output <dir>  — when --output is NOT the literal "output", heimdall
    //                     writes files directly to <dir>/<filename> (no
    //                     nested target subdir; see heimdall/cli/output.rs)
    await execFileAsync(
      "heimdall",
      [
        "decompile",
        bytecodeFile,
        "--output",
        workDir,
        "--include-sol",
        "--skip-resolving",
        "--default",
      ],
      { timeout, maxBuffer: 32 * 1024 * 1024 },
    );

    // With --output=<workDir>, heimdall emits:
    //   <workDir>/abi.json
    //   <workDir>/decompiled.sol   (with --include-sol)
    const decompPath = join(workDir, "decompiled.sol");
    const abiPath = join(workDir, "abi.json");

    const pseudoSource = await readOptional(decompPath);
    const abiJson = await readOptional(abiPath);

    // Storage slots come from PARSING the .sol output — heimdall doesn't
    // emit a separate storage.json. The parser regex-scans for
    // `storage[<hex>]` references and labels each match against the
    // known proxy-pattern registry.
    const slots = pseudoSource ? extractStorageSlots(pseudoSource) : [];
    const inferredAbi = abiJson ? safeParseJson(abiJson) : null;

    const result: DecompiledContract = {
      hasLayout: slots.length > 0,
      slots: slots.map((s) => ({
        slot: s.slot,
        inferredType: null,
        access: s.access,
        name: null,
        known: s.known,
        hitCount: s.hitCount,
      })),
      pseudoSource,
      inferredAbi: Array.isArray(inferredAbi) ? (inferredAbi as unknown[]) : null,
    };

    // Best-effort cache write — never fail the request on a cache miss.
    // Future requests for the same bytecode hash (any address, any chain)
    // get the answer in ~5ms instead of 10-30s.
    const durationMs = Date.now() - startedAt;
    void cacheDecompilation(hex, result, {
      durationMs,
      heimdallVersion: await heimdallVersion(),
    }).catch((err) =>
      console.warn(
        `[heimdall] cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    return result;
  } catch (err) {
    // Timeout / non-zero exit / OOM — degrade to null. Log so prod
    // observability catches recurring heimdall failures.
    console.warn(
      `[heimdall] decompile failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    // Best-effort cleanup; ignore EBUSY / ENOTEMPTY on concurrent rm.
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// `parseHeimdallStorage` was removed: heimdall doesn't emit a
// `storage.json` file. Storage references are extracted from the
// decompiled `.sol` source by extractStorageSlots in parseDecompiled.ts.
