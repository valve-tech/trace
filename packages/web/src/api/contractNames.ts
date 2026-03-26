const cache = new Map<string, string | null>();

/**
 * Batch resolve contract names from the source endpoint.
 * Returns a map of address → contract name (or null if not verified).
 */
export async function resolveContractNames(
  addresses: string[],
): Promise<Record<string, string | null>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const result: Record<string, string | null> = {};

  // Check local cache first
  const uncached: string[] = [];
  for (const addr of unique) {
    if (cache.has(addr)) {
      result[addr] = cache.get(addr)!;
    } else {
      uncached.push(addr);
    }
  }

  // Fetch uncached in parallel (max 5 concurrent)
  const BATCH = 5;
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    const fetched = await Promise.all(
      batch.map(async (addr) => {
        try {
          const res = await fetch(`/api/source/${addr}`, {
            signal: AbortSignal.timeout(5_000),
          });
          if (!res.ok) return { addr, name: null };
          const data = (await res.json()) as {
            ok: boolean;
            source?: { contractName?: string | null };
          };
          return { addr, name: data.source?.contractName ?? null };
        } catch {
          return { addr, name: null };
        }
      }),
    );

    for (const { addr, name } of fetched) {
      cache.set(addr, name);
      result[addr] = name;
    }
  }

  return result;
}
