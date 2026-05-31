import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cacheDecompilation, getCachedDecompilation } from "./cache.js";

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
 * Per-slot storage access entry inferred from bytecode by heimdall.
 * Heimdall's analyzer detects PUSH-then-SLOAD/SSTORE patterns, simple
 * keccak-derived mappings, and inferred type widths (uint8 vs uint256)
 * by tracing AND-mask operations after SLOAD.
 */
export interface DecompiledStorageSlot {
  /** Hex slot value (0x-prefixed). For mappings, this is the base slot. */
  slot: string;
  /** Inferred type, when heimdall could narrow it. e.g. "uint256" / "address" / "bytes32". */
  inferredType: string | null;
  /** "read" / "write" — what kinds of access heimdall observed. */
  access: ("read" | "write")[];
  /**
   * Heimdall-inferred name (e.g. "owner", "_balances"). Best-effort —
   * derived from access patterns, not source. Null when no plausible
   * name was inferred.
   */
  name: string | null;
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
  const workDir = await mkdir(
    join(tmpdir(), `heimdall-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    { recursive: true },
  );
  if (!workDir) return null;

  const startedAt = Date.now();
  try {
    const bytecodeFile = join(workDir, "bytecode.txt");
    await writeFile(bytecodeFile, hex, "utf8");

    // heimdall writes its outputs to ./output by default; --output puts
    // them in our isolated workDir so concurrent calls don't collide.
    await execFileAsync(
      "heimdall",
      [
        "decompile",
        bytecodeFile,
        "--output",
        workDir,
        "--include-yul", // emit storage analysis in the Yul output
        "--name",
        "contract",
      ],
      { timeout, maxBuffer: 32 * 1024 * 1024 },
    );

    // heimdall emits:
    //   output/contract/decompiled.sol  (pseudo-Solidity)
    //   output/contract/abi.json
    //   output/contract/storage.json    (or embedded in decompiled.sol comments)
    const decompPath = join(workDir, "contract", "decompiled.sol");
    const abiPath = join(workDir, "contract", "abi.json");
    const storagePath = join(workDir, "contract", "storage.json");

    const pseudoSource = await readOptional(decompPath);
    const abiJson = await readOptional(abiPath);
    const storageJson = await readOptional(storagePath);

    const slots = storageJson ? parseHeimdallStorage(storageJson) : [];
    const inferredAbi = abiJson ? safeParseJson(abiJson) : null;

    const result: DecompiledContract = {
      hasLayout: slots.length > 0,
      slots,
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

/**
 * Parse heimdall's storage.json into the canonical DecompiledStorageSlot
 * shape. Heimdall's schema has shifted between versions, so we try a
 * couple of known shapes and fall back to an empty array on unknown.
 *
 * Versions seen in the wild:
 *   v0.8+: { "0xSLOT": { type, modifiers: [...] } }
 *   v0.7:  { storage: { "0xSLOT": { type } } }
 */
export function parseHeimdallStorage(json: string): DecompiledStorageSlot[] {
  const parsed = safeParseJson(json);
  if (!parsed || typeof parsed !== "object") return [];
  const rec = parsed as Record<string, unknown>;
  const root =
    "storage" in rec && typeof rec.storage === "object" && rec.storage !== null
      ? (rec.storage as Record<string, unknown>)
      : rec;

  const out: DecompiledStorageSlot[] = [];
  for (const [slot, raw] of Object.entries(root)) {
    if (!slot.startsWith("0x")) continue;
    const meta = (raw ?? {}) as Record<string, unknown>;
    const access: ("read" | "write")[] = [];
    const modifiers = Array.isArray(meta.modifiers) ? meta.modifiers : [];
    if (modifiers.includes("read") || modifiers.includes("sload")) access.push("read");
    if (modifiers.includes("write") || modifiers.includes("sstore")) access.push("write");
    if (access.length === 0) access.push("read"); // default — heimdall lists it because it touches it
    out.push({
      slot,
      inferredType: typeof meta.type === "string" ? meta.type : null,
      access,
      name: typeof meta.name === "string" ? meta.name : null,
    });
  }
  return out;
}
