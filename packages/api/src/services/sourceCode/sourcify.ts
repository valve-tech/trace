import {
  FETCH_TIMEOUT,
  SOURCIFY_API_URL,
  UpstreamError,
  type SourceFile,
  type VerifiedSource,
} from "./types.js";

interface SourcifyFile {
  name: string;
  path: string;
  content: string;
}

/**
 * Fetch verified source from Sourcify. Used when BlockScout doesn't have
 * the contract. Sourcify distinguishes "full" (bytecode + metadata match
 * exactly) and "partial" (metadata-only) matches — we try full first and
 * fall back to partial.
 *
 * PulseChain mainnet chainId is 369; this is hardcoded because Sourcify
 * requires the chain in the URL and we only serve PulseChain today.
 */
export async function fetchFromSourcify(
  address: string,
): Promise<VerifiedSource | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const chainId = 369;

    // Sourcify migration (2025): the old `/repository/contracts/{full,partial}_match/<chain>/<addr>/`
    // existence-check + `/files/<chain>/<addr>` file-fetch flow was retired and now 404s for
    // every request. The replacement is a single `/files/any/<chain>/<addr>` call returning
    // `{ status: "full" | "partial", files: [...] }`, with HTTP 404 meaning "not verified at
    // either match strength." One round-trip instead of two.
    const url = `${SOURCIFY_API_URL}/files/any/${chainId}/${address}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw new UpstreamError(
        "sourcify",
        err instanceof Error ? err.message : "network error",
      );
    }
    if (res.status >= 500) throw new UpstreamError("sourcify", `HTTP ${res.status}`);
    if (res.status === 404) return null; // definitive "not verified here"
    if (!res.ok) throw new UpstreamError("sourcify", `HTTP ${res.status}`);

    const body = (await res.json()) as {
      status?: "full" | "partial";
      files?: SourcifyFile[];
    };
    if (!body.files || body.files.length === 0) return null;

    const sourceFiles: SourceFile[] = [];
    let abi: unknown[] = [];
    let compilerVersion: string | null = null;

    for (const file of body.files) {
      if (file.name === "metadata.json") {
        try {
          const metadata = JSON.parse(file.content) as {
            compiler?: { version?: string };
            output?: { abi?: unknown[] };
          };
          compilerVersion = metadata.compiler?.version ?? null;
          abi = metadata.output?.abi ?? [];
        } catch {
          // ignore — metadata may not parse for partial matches
        }
      } else if (file.name.endsWith(".sol")) {
        sourceFiles.push({ name: file.name, content: file.content });
      }
    }

    if (sourceFiles.length === 0) return null;

    return {
      address: address.toLowerCase(),
      chainSource: "sourcify",
      contractName: sourceFiles[0]?.name.replace(".sol", "") ?? null,
      compilerVersion,
      optimizationUsed: false,
      optimizationRuns: null,
      sourceFiles,
      abi,
      sourceMap: null,
      deployedBytecode: null,
    };
  } catch (err) {
    // Let UpstreamError propagate so getVerifiedSource can distinguish
    // "sourcify is down" from "sourcify said this contract isn't there".
    if (err instanceof UpstreamError) throw err;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ===========================================================================
// Verification submit (forward an inbound verification request to Sourcify).
// ===========================================================================

/**
 * Match strength reported by Sourcify after a successful verify.
 *
 *   - `perfect`  — bytecode + metadata hash both match exactly
 *   - `partial`  — bytecode matches but metadata differs (e.g. different
 *                  source paths or comment differences); semantically OK
 *                  but suggests the build isn't reproducible
 *
 * Mirrors Etherscan's verification statuses for the dispatcher's response
 * envelope.
 */
export type SourcifyMatch = "perfect" | "partial";

export interface SourcifyVerifySuccess {
  ok: true;
  match: SourcifyMatch;
  /** ISO timestamp Sourcify recorded for the verified entry. */
  storageTimestamp: string | null;
  /** Sourcify response body, retained for the GUID-poll shim. */
  raw: unknown;
}

export interface SourcifyVerifyFailure {
  ok: false;
  /** User-facing error message from Sourcify (e.g. "deployed bytecode does not match"). */
  error: string;
  /** Sourcify response body. */
  raw: unknown;
}

export type SourcifyVerifyResult = SourcifyVerifySuccess | SourcifyVerifyFailure;

export interface SubmitToSourcifyRequest {
  /** Lowercased 0x-address of the deployed contract. */
  address: string;
  /** Numeric chainId — defaults to 369 (PulseChain mainnet) at call sites. */
  chainId: number;
  /** Map of filename → file content. MUST include a `metadata.json` whose
   *  hash matches the deployed bytecode for Sourcify to accept a perfect
   *  match; the partial-match path is more permissive. */
  files: Record<string, string>;
}

/**
 * POST a verification submission to Sourcify and return the match result.
 *
 * Sourcify's verify endpoint is synchronous — unlike Etherscan, which
 * returns a GUID and makes you poll. The Etherscan-shaped dispatcher
 * wraps this in an in-memory GUID table so callers using
 * `checkverifystatus` see the familiar async flow.
 *
 * Failures fall into two buckets:
 *   1. Sourcify reachable, said "no" (bytecode mismatch, missing
 *      metadata, etc.) → resolves with `ok: false` and the upstream
 *      message; the caller decides whether to surface or retry.
 *   2. Sourcify unreachable (network, 5xx, timeout) → throws
 *      `UpstreamError` so the dispatcher can return a 503 instead of
 *      poisoning a stable "verification failed" state.
 */
export async function submitToSourcify(
  req: SubmitToSourcifyRequest,
): Promise<SourcifyVerifyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const url = `${SOURCIFY_API_URL}/verify`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: req.address.toLowerCase(),
          chain: String(req.chainId),
          files: req.files,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new UpstreamError(
        "sourcify",
        err instanceof Error ? err.message : "network error",
      );
    }

    // Transient — 5xx, gateway hiccups. Bubble out so the route can 503.
    if (res.status >= 500) {
      throw new UpstreamError("sourcify", `HTTP ${res.status}`);
    }

    const body = (await res.json().catch(() => null)) as
      | {
          result?: Array<{
            address?: string;
            chainId?: string;
            status?: string;
            storageTimestamp?: string;
            message?: string;
          }>;
          error?: string;
        }
      | null;

    if (!res.ok || !body) {
      return {
        ok: false,
        error: body?.error ?? `Sourcify returned HTTP ${res.status}`,
        raw: body,
      };
    }

    const entry = body.result?.[0];
    const status = entry?.status;
    if (status === "perfect" || status === "partial") {
      return {
        ok: true,
        match: status,
        storageTimestamp: entry?.storageTimestamp ?? null,
        raw: body,
      };
    }

    return {
      ok: false,
      error: entry?.message ?? body.error ?? "Sourcify rejected the submission",
      raw: body,
    };
  } finally {
    clearTimeout(timer);
  }
}
