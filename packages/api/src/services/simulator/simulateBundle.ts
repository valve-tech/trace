import type { Address } from "viem";
import type {
  SimulateRequest,
  SimulationResult,
  StateOverrideMap,
} from "../../types.js";
import { simulateTransaction } from "./simulateTransaction.js";

/**
 * Simulate a bundle of transactions sequentially.
 *
 * Each transaction is simulated in order. Cumulative state overrides
 * from earlier transactions are merged into subsequent ones so that
 * side-effects compose across the bundle. Because `eth_call` is
 * read-only, true state propagation requires the caller to supply
 * explicit `stateOverrides` between steps — this function merges them
 * automatically where provided.
 *
 * Per-tx overrides win over cumulative overrides; `stateDiff` is
 * deep-merged so per-tx slot writes don't clobber earlier writes to
 * different slots on the same account.
 */
export async function simulateBundle(
  transactions: SimulateRequest[],
  blockNumber?: string | number,
): Promise<SimulationResult[]> {
  const results: SimulationResult[] = [];
  let cumulativeOverrides: StateOverrideMap = {};

  for (const tx of transactions) {
    const mergedOverrides: StateOverrideMap = { ...cumulativeOverrides };

    const txOverrides = tx.stateOverrides as StateOverrideMap | undefined;
    if (txOverrides) {
      for (const [addr, entry] of Object.entries(txOverrides)) {
        const existing = mergedOverrides[addr as Address];
        if (existing) {
          mergedOverrides[addr as Address] = {
            ...existing,
            ...entry,
            stateDiff: { ...existing.stateDiff, ...entry.stateDiff },
          };
        } else {
          mergedOverrides[addr as Address] = entry;
        }
      }
    }

    const enrichedTx: SimulateRequest = {
      ...tx,
      blockNumber: tx.blockNumber ?? blockNumber,
      stateOverrides:
        Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined,
    };

    const result = await simulateTransaction(enrichedTx);
    results.push(result);

    cumulativeOverrides = mergedOverrides;
  }

  return results;
}
