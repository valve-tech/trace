import { publicClient } from "../rpc.js";
import { processBlock } from "./processBlock.js";

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastProcessedBlock: bigint = 0n;
let isProcessing = false;

/**
 * Start a 3-second block poller. Idempotent — calling again while
 * already running is a no-op. The poller initializes lastProcessedBlock
 * to whatever the chain head is on the first tick, then walks forward
 * up to 5 blocks per cycle so a backlog can't pin event-loop time
 * indefinitely.
 */
export function startMonitor(): void {
  if (pollingInterval) {
    console.log("[monitor] already running");
    return;
  }
  console.log("[monitor] starting block poller (3s interval)");
  pollingInterval = setInterval(() => {
    void pollBlocks();
  }, 3000);
  void pollBlocks();
}

export function stopMonitor(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[monitor] stopped");
  }
}

/**
 * One tick of the poll loop. Guarded against re-entry so a slow block
 * fetch can't pile up overlapping work. Exported so tests can drive
 * the loop deterministically.
 */
export async function pollBlocks(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const latestBlockNumber = await publicClient.getBlockNumber();

    if (lastProcessedBlock === 0n) {
      lastProcessedBlock = latestBlockNumber;
      console.log(`[monitor] initialized at block ${latestBlockNumber}`);
      return;
    }

    if (latestBlockNumber <= lastProcessedBlock) return;

    const startBlock = lastProcessedBlock + 1n;
    const endBlock =
      latestBlockNumber - startBlock > 5n
        ? startBlock + 5n
        : latestBlockNumber;

    for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
      await processBlock(blockNum);
    }

    lastProcessedBlock = endBlock;
  } catch (err) {
    console.error("[monitor] poll error:", err);
  } finally {
    isProcessing = false;
  }
}
