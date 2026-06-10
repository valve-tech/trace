import { listChains } from "../chains/registry.js";
import { getRpcClient } from "../chains/clients.js";
import { processBlock } from "./processBlock.js";

/**
 * Per-chain poller state. One watcher per registered chain — each tracks
 * its own head and re-entry guard so a slow chain (or a stalled RPC) can't
 * hold back the others.
 */
export interface ChainWatcher {
  chainId: number;
  lastProcessedBlock: bigint;
  isProcessing: boolean;
}

const POLL_INTERVAL_MS = 3_000;
/** Max blocks walked per chain per tick — a backlog can't pin the loop. */
const MAX_CATCHUP_BLOCKS = 5n;

const watchers = new Map<number, ChainWatcher>();
let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function makeWatcher(chainId: number): ChainWatcher {
  return { chainId, lastProcessedBlock: 0n, isProcessing: false };
}

/**
 * Compute the next [start, end] block window for a chain, capped at
 * MAX_CATCHUP_BLOCKS so catching up after downtime walks forward in
 * bounded slices instead of replaying the whole backlog in one tick.
 */
export function catchUpRange(
  lastProcessed: bigint,
  latest: bigint,
): [start: bigint, end: bigint] {
  const start = lastProcessed + 1n;
  const end = latest - start > MAX_CATCHUP_BLOCKS ? start + MAX_CATCHUP_BLOCKS : latest;
  return [start, end];
}

/**
 * Start a 3-second block poller covering every chain in the registry
 * (the valve launch set 1/369/943, or the operator's CHAINS_JSON).
 * Idempotent — calling again while already running is a no-op. Each
 * watcher initializes its head to the chain tip on the first tick, then
 * walks forward up to MAX_CATCHUP_BLOCKS per cycle.
 */
export function startMonitor(): void {
  if (pollingInterval) {
    console.log("[monitor] already running");
    return;
  }
  const chains = listChains();
  for (const chain of chains) {
    watchers.set(chain.chainId, makeWatcher(chain.chainId));
  }
  console.log(
    `[monitor] starting block pollers (3s interval) for chains ${chains
      .map((c) => c.chainId)
      .join(", ")}`,
  );
  pollingInterval = setInterval(() => {
    void pollAllChains();
  }, POLL_INTERVAL_MS);
  void pollAllChains();
}

export function stopMonitor(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    watchers.clear();
    console.log("[monitor] stopped");
  }
}

/**
 * One tick: poll every chain concurrently. Per-chain `isProcessing`
 * guards make a slow chain skip its own next tick without delaying the
 * others. Exported so tests can drive the loop deterministically.
 */
export async function pollAllChains(): Promise<void> {
  await Promise.all([...watchers.values()].map((w) => pollChain(w)));
}

/**
 * One tick of one chain's poll loop. Guarded against re-entry so a slow
 * block fetch can't pile up overlapping work on the same chain.
 */
export async function pollChain(watcher: ChainWatcher): Promise<void> {
  if (watcher.isProcessing) return;
  watcher.isProcessing = true;

  try {
    const latestBlockNumber = await getRpcClient(watcher.chainId).getBlockNumber();

    if (watcher.lastProcessedBlock === 0n) {
      watcher.lastProcessedBlock = latestBlockNumber;
      console.log(
        `[monitor] chain ${watcher.chainId} initialized at block ${latestBlockNumber}`,
      );
      return;
    }

    if (latestBlockNumber <= watcher.lastProcessedBlock) return;

    const [startBlock, endBlock] = catchUpRange(
      watcher.lastProcessedBlock,
      latestBlockNumber,
    );

    for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
      await processBlock(blockNum, watcher.chainId);
    }

    watcher.lastProcessedBlock = endBlock;
  } catch (err) {
    console.error(`[monitor] chain ${watcher.chainId} poll error:`, err);
  } finally {
    watcher.isProcessing = false;
  }
}
