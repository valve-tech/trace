import { toFunctionSelector, toEventSelector, type AbiFunction, type AbiEvent } from "viem";

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
  /** topic0 (0x + 64 hex, lowercase) → event signature, e.g.
   *  `Transfer(address,address,uint256)`. Lets the debugger label emitted
   *  events from the verified ABI without a 4byte round-trip. */
  events: Record<string, string>;
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

function buildEventMap(abi: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(abi)) return map;
  for (const item of abi) {
    const ev = item as AbiEvent;
    if (!item || ev.type !== "event") continue;
    try {
      const topic0 = toEventSelector(ev).toLowerCase();
      const params = (ev.inputs ?? []).map((i) => i.type).join(",");
      map[topic0] = `${ev.name}(${params})`;
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

  // Modest concurrency — the upstream verification source may recompile,
  // so flooding the endpoint 500s.
  const BATCH = 4;
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const fetched = await Promise.all(
      batch.map(async (addr): Promise<[string, ContractMeta]> => {
        try {
          // Etherscan-shaped surface — `module=contract&action=getsourcecode`
          // returns an array of one record; `ContractName === ""` and `ABI ===
          // "Contract source code not verified"` signal the unverified case.
          // We use this rather than `/api/source/:addr` directly because the
          // module/action shape is what external tooling (hardhat-verify,
          // foundry) will use, and exercising it from the in-app call tree
          // gives us coverage of the same code path.
          const url = `/api?module=contract&action=getsourcecode&address=${addr}`;
          const res = await fetch(url, {
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return [addr, { name: null, selectors: {}, events: {} }];
          const data = (await res.json()) as {
            status?: string;
            result?: Array<{ ContractName?: string; ABI?: string }>;
          };
          if (data.status !== "1") {
            return [addr, { name: null, selectors: {}, events: {} }];
          }
          const record = data.result?.[0];
          const name = record?.ContractName ? record.ContractName : null;
          let abi: unknown = [];
          if (record?.ABI && record.ABI !== "Contract source code not verified") {
            try {
              abi = JSON.parse(record.ABI);
            } catch {
              // Malformed ABI string — fall through with no selectors.
            }
          }
          return [
            addr,
            {
              name,
              selectors: buildSelectorMap(abi),
              events: buildEventMap(abi),
            },
          ];
        } catch {
          return [addr, { name: null, selectors: {}, events: {} }];
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
