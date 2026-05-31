import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Etherscan envelope discriminator invariant.
 *
 * Every client function in `packages/web/src/api/*.ts` that fetches an
 * Etherscan-shape endpoint (HTTP 200 + `{ status, message, result }`
 * envelope OR HTTP 200 + JSON-RPC `{ jsonrpc, result, error }` envelope)
 * must NEVER produce a value that the caller would cache as canonical
 * when the upstream is transiently unavailable.
 *
 * Two valid satisfaction shapes:
 *
 *   - **Single-result functions** (one address, one block, etc.) satisfy
 *     by THROWING on a transient envelope. useQuery's error state then
 *     prevents caching the result.
 *
 *   - **Batch functions** (multiple addresses in one call) satisfy by
 *     RETURNING A SPARSE record — addresses that didn't get a definitive
 *     answer are *omitted*, not returned as empty placeholders. The
 *     wrapping hook then uses a conditional `staleTime` to decide caching.
 *
 * The 2026-05-29 contractMeta bug (commits 5f384d8 / a0c9f80) was a
 * silent absorption of the Etherscan `status="0"` envelope into
 * downstream empty data, then pinned into IndexedDB forever under
 * `staleTime: Infinity`. This harness regression-proofs the lesson:
 * adding a new Etherscan-shape function requires registering it below,
 * which forces a choice between the two shapes.
 *
 * If you add a new function under `packages/web/src/api/` that fetches
 * `?module=...&action=...`, register it in REGISTRY and pick a shape.
 */

interface RegistryEntry {
  /** Display name in test output. */
  name: string;
  /**
   * Invoke the function in a way that exercises the Etherscan-shape path.
   * The function will see `globalThis.fetch` stubbed to return a transient
   * envelope for every request.
   */
  invoke: () => Promise<unknown>;
  /**
   * What the function MUST do on transient upstream:
   *  - "throws" — rejected promise. Single-result functions.
   *  - "sparse" — resolves with a value that does not carry "wrong but
   *    cacheable" data. Batch functions return omission-based records.
   */
  shape: "throws" | "sparse";
  /**
   * Only for `shape: "sparse"`. Returns true iff the value is
   * non-canonical (i.e. would not mislead a cache-as-canonical consumer).
   * For a Record the canonical check is "no entries"; for other shapes,
   * supply your own predicate.
   */
  isSparse?: (value: unknown) => boolean;
}

const TRANSIENT_ETHERSCAN_ENVELOPE = {
  status: "0",
  message: "NOTOK",
  result: "Verification source temporarily unavailable: blockscout+sourcify",
};
const TRANSIENT_JSONRPC_ENVELOPE = {
  jsonrpc: "2.0",
  id: 1,
  error: { code: -32603, message: "upstream temporarily unavailable" },
};

function stubAllFetchAsTransient(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    // The dispatcher's `proxy` module always returns the JSON-RPC envelope;
    // every other module returns the Etherscan envelope. Discriminate so
    // the test stub matches what callers actually parse.
    const envelope = url.includes("module=proxy")
      ? TRANSIENT_JSONRPC_ENVELOPE
      : TRANSIENT_ETHERSCAN_ENVELOPE;
    return {
      ok: true,
      status: 200,
      json: async () => envelope,
    } as Response;
  });
}

describe("Etherscan envelope discriminator — invariant across api/ functions", () => {
  // resolveContractMeta is the only function with a module-level cache;
  // resetModules + re-import gives each test a clean slate. fake timers
  // collapse its retry backoff (500/1000/2000ms) to instant.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // REGISTRY — every Etherscan-shape function in packages/web/src/api/ MUST
  // appear here. Adding a new one without registering will silently miss the
  // invariant; reviewers should look for this on Etherscan-migration PRs.
  // -------------------------------------------------------------------------
  const REGISTRY: () => Promise<RegistryEntry[]> = async () => {
    const { resolveContractMeta } = await import("../api/contractMeta");
    const { fetchAddressInfo, fetchBlock } = await import("../api/explorer");
    return [
      {
        name: "resolveContractMeta",
        invoke: () => resolveContractMeta(["0xefd2ab7e09f436e8d29bb04df76a9dec77e5f0a3"]),
        shape: "sparse",
        // Returns a Record<address, ContractMeta>. Sparse = empty.
        isSparse: (v) =>
          typeof v === "object" && v !== null && Object.keys(v).length === 0,
      },
      {
        name: "fetchAddressInfo",
        invoke: () => fetchAddressInfo("0xefd2ab7e09f436e8d29bb04df76a9dec77e5f0a3"),
        shape: "throws",
      },
      {
        name: "fetchBlock (by number)",
        invoke: () => fetchBlock("12345"),
        shape: "throws",
      },
      {
        name: "fetchBlock (by hash)",
        invoke: () =>
          fetchBlock(
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          ),
        shape: "throws",
      },
    ];
  };

  it("registry is non-empty (sanity)", async () => {
    const fns = await REGISTRY();
    expect(fns.length).toBeGreaterThan(0);
  });

  it("every registered function satisfies its declared invariant", async () => {
    const fns = await REGISTRY();
    for (const fn of fns) {
      stubAllFetchAsTransient();
      // Suppress console.warn from the functions under test — they're
      // expected to log on transient.
      vi.spyOn(console, "warn").mockImplementation(() => {});

      if (fn.shape === "throws") {
        // Attach the rejection handler synchronously via expect().rejects so
        // the promise never floats as "unhandled" between creation and the
        // first await. No timer dance — single-result functions throw on
        // their first transient response with no retry.
        await expect(fn.invoke()).rejects.toBeDefined();
      } else {
        // Batch functions retry with backoff. Catch upfront so the rejection
        // can't slip out as unhandled while we advance timers, then assert
        // on the resolved value.
        const pending = fn.invoke().catch((err: unknown) => {
          throw new Error(`sparse function unexpectedly threw: ${String(err)}`);
        });
        await vi.runAllTimersAsync();
        const value = await pending;
        if (!fn.isSparse) {
          throw new Error(
            `Registry entry "${fn.name}" has shape="sparse" but no isSparse predicate`,
          );
        }
        expect(fn.isSparse(value)).toBe(true);
      }
      vi.restoreAllMocks();
    }
  });

  // -------------------------------------------------------------------------
  // Per-function tests — same assertion but isolated, so failures point
  // at one function instead of the whole sweep.
  // -------------------------------------------------------------------------

  it("resolveContractMeta returns sparse on transient envelope", async () => {
    stubAllFetchAsTransient();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { resolveContractMeta } = await import("../api/contractMeta");
    const pending = resolveContractMeta([
      "0xefd2ab7e09f436e8d29bb04df76a9dec77e5f0a3",
    ]);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(Object.keys(result)).toEqual([]);
  });

  it("fetchAddressInfo throws on transient balance envelope", async () => {
    stubAllFetchAsTransient();
    const { fetchAddressInfo } = await import("../api/explorer");
    await expect(
      fetchAddressInfo("0xefd2ab7e09f436e8d29bb04df76a9dec77e5f0a3"),
    ).rejects.toThrow();
  });

  it("fetchBlock throws on transient JSON-RPC error envelope (by number)", async () => {
    stubAllFetchAsTransient();
    const { fetchBlock } = await import("../api/explorer");
    await expect(fetchBlock("12345")).rejects.toThrow();
  });

  it("fetchBlock throws on transient JSON-RPC error envelope (by hash)", async () => {
    stubAllFetchAsTransient();
    const { fetchBlock } = await import("../api/explorer");
    await expect(
      fetchBlock(
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).rejects.toThrow();
  });
});
