import { toFunctionSelector, type AbiFunction } from "viem";

/**
 * Per-contract metadata derived from a single /api/source fetch: the verified
 * contract name and a selector → function-name map built from its ABI.
 *
 * Both are needed to label the call tree (contract name + function name), and
 * fetching the source once per address — rather than once for names and again
 * for ABIs — halves the request load that was tripping backend 500s.
 */

export interface ContractMeta {
  name: string | null;
  /** selector (0x + 8 hex, lowercase) → function name */
  selectors: Record<string, string>;
}

const cache = new Map<string, ContractMeta>();

function buildSelectorMap(abi: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(abi)) return map;
  for (const item of abi) {
    if (!item || (item as { type?: string }).type !== "function") continue;
    try {
      map[toFunctionSelector(item as AbiFunction).toLowerCase()] = (
        item as AbiFunction
      ).name;
    } catch {
      // Skip malformed ABI entries.
    }
  }
  return map;
}

export async function resolveContractMeta(
  addresses: string[],
): Promise<Record<string, ContractMeta>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const result: Record<string, ContractMeta> = {};

  const uncached: string[] = [];
  for (const addr of unique) {
    if (cache.has(addr)) result[addr] = cache.get(addr)!;
    else uncached.push(addr);
  }

  // Modest concurrency — /api/source can recompile, so flooding it 500s.
  const BATCH = 4;
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const fetched = await Promise.all(
      batch.map(async (addr): Promise<[string, ContractMeta]> => {
        try {
          const res = await fetch(`/api/source/${addr}`, {
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return [addr, { name: null, selectors: {} }];
          const data = (await res.json()) as {
            ok: boolean;
            source?: { contractName?: string | null; abi?: unknown };
          };
          return [
            addr,
            {
              name: data.source?.contractName ?? null,
              selectors: buildSelectorMap(data.source?.abi),
            },
          ];
        } catch {
          return [addr, { name: null, selectors: {} }];
        }
      }),
    );

    for (const [addr, meta] of fetched) {
      cache.set(addr, meta);
      result[addr] = meta;
    }
  }

  return result;
}
