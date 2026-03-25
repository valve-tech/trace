import { publicClient } from "./rpc.js";
import {
  getEnabledAlerts,
  recordAlertTrigger,
  type AlertRow,
} from "./db.js";
import { dispatch, type MatchData } from "./notifier.js";
import { type Address, formatEther, keccak256, toHex, type Log } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BlockTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  input: string;
}

interface AlertConditions {
  address?: string;
  contractAddress?: string;
  eventSignature?: string;
  functionSelector?: string;
  threshold?: string;
  direction?: "above" | "below";
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastProcessedBlock: bigint = 0n;
let isProcessing = false;

const cooldownMap = new Map<number, number>();

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Poll blocks
// ---------------------------------------------------------------------------
async function pollBlocks(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const latestBlockNumber = await publicClient.getBlockNumber();

    if (lastProcessedBlock === 0n) {
      lastProcessedBlock = latestBlockNumber;
      console.log(`[monitor] initialized at block ${latestBlockNumber}`);
      isProcessing = false;
      return;
    }

    if (latestBlockNumber <= lastProcessedBlock) {
      isProcessing = false;
      return;
    }

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

// ---------------------------------------------------------------------------
// Process a single block
// ---------------------------------------------------------------------------
async function processBlock(blockNumber: bigint): Promise<void> {
  const alerts = await getEnabledAlerts();
  if (alerts.length === 0) return;

  try {
    const block = await publicClient.getBlock({
      blockNumber,
      includeTransactions: true,
    });

    const txs: BlockTransaction[] = (
      block.transactions as Array<{
        hash: string;
        from: string;
        to: string | null;
        value: bigint;
        input: string;
      }>
    ).map((tx) => ({
      hash: tx.hash,
      from: tx.from.toLowerCase(),
      to: tx.to?.toLowerCase() ?? null,
      value: tx.value,
      input: tx.input,
    }));

    let logs: Log[] = [];
    try {
      logs = await publicClient.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
      });
    } catch (err) {
      console.warn(`[monitor] failed to fetch logs for block ${blockNumber}:`, err);
    }

    await matchAlerts(alerts, block, txs, logs, blockNumber);
  } catch (err) {
    console.error(`[monitor] error processing block ${blockNumber}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Match alerts — conditions is now a JSONB object from pg
// ---------------------------------------------------------------------------
async function matchAlerts(
  alerts: AlertRow[],
  _block: unknown,
  txs: BlockTransaction[],
  logs: Log[],
  blockNumber: bigint,
): Promise<void> {
  for (const alert of alerts) {
    const lastTrigger = cooldownMap.get(alert.id);
    if (lastTrigger && Date.now() - lastTrigger < alert.cooldown_seconds * 1000) {
      continue;
    }

    const conditions = alert.conditions as unknown as AlertConditions;

    let matchData: MatchData | null = null;

    try {
      switch (alert.type) {
        case "address_activity":
          matchData = matchAddressActivity(conditions, txs, blockNumber);
          break;
        case "contract_event":
          matchData = matchContractEvent(conditions, logs, blockNumber);
          break;
        case "function_call":
          matchData = matchFunctionCall(conditions, txs, blockNumber);
          break;
        case "balance_threshold":
          matchData = await matchBalanceThreshold(conditions, blockNumber);
          break;
        case "failed_tx":
          matchData = await matchFailedTx(conditions, txs, blockNumber);
          break;
      }
    } catch (err) {
      console.error(`[monitor] error matching alert ${alert.id}:`, err);
    }

    if (matchData) {
      cooldownMap.set(alert.id, Date.now());
      await recordAlertTrigger({
        alert_id: alert.id,
        tx_hash: matchData.txHash ?? null,
        block_number: Number(blockNumber),
        matched_data: JSON.stringify(matchData),
      });
      dispatch(alert, matchData).catch((err) => {
        console.error(`[monitor] notification dispatch error for alert ${alert.id}:`, err);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Alert matchers
// ---------------------------------------------------------------------------

function matchAddressActivity(
  conditions: AlertConditions,
  txs: BlockTransaction[],
  blockNumber: bigint,
): MatchData | null {
  const addr = conditions.address?.toLowerCase();
  if (!addr) return null;

  const tx = txs.find((t) => t.from === addr || t.to === addr);
  if (!tx) return null;

  return {
    type: "address_activity",
    txHash: tx.hash,
    blockNumber: Number(blockNumber),
    from: tx.from,
    to: tx.to ?? undefined,
    value: formatEther(tx.value),
    summary: `Address ${addr} was involved in tx ${tx.hash}`,
  };
}

function matchContractEvent(
  conditions: AlertConditions,
  logs: Log[],
  blockNumber: bigint,
): MatchData | null {
  const contractAddr = conditions.contractAddress?.toLowerCase();
  const eventSig = conditions.eventSignature;
  if (!contractAddr || !eventSig) return null;

  const topic0 = keccak256(toHex(eventSig));

  const log = logs.find(
    (l) =>
      l.address.toLowerCase() === contractAddr &&
      l.topics[0]?.toLowerCase() === topic0.toLowerCase(),
  );
  if (!log) return null;

  return {
    type: "contract_event",
    txHash: log.transactionHash ?? undefined,
    blockNumber: Number(blockNumber),
    eventSignature: eventSig,
    summary: `Event ${eventSig} emitted by ${contractAddr} in block ${blockNumber}`,
  };
}

function matchFunctionCall(
  conditions: AlertConditions,
  txs: BlockTransaction[],
  blockNumber: bigint,
): MatchData | null {
  const contractAddr = conditions.contractAddress?.toLowerCase();
  const selector = conditions.functionSelector?.toLowerCase();
  if (!contractAddr || !selector) return null;

  const normalizedSelector = selector.startsWith("0x") ? selector : `0x${selector}`;

  const tx = txs.find(
    (t) =>
      t.to === contractAddr &&
      t.input.toLowerCase().startsWith(normalizedSelector),
  );
  if (!tx) return null;

  return {
    type: "function_call",
    txHash: tx.hash,
    blockNumber: Number(blockNumber),
    from: tx.from,
    to: tx.to ?? undefined,
    functionSelector: normalizedSelector,
    summary: `Function ${normalizedSelector} called on ${contractAddr} in tx ${tx.hash}`,
  };
}

async function matchBalanceThreshold(
  conditions: AlertConditions,
  blockNumber: bigint,
): Promise<MatchData | null> {
  const addr = conditions.address;
  const threshold = conditions.threshold;
  const direction = conditions.direction;
  if (!addr || !threshold || !direction) return null;

  try {
    const balance = await publicClient.getBalance({
      address: addr as Address,
      blockNumber,
    });

    const thresholdWei = BigInt(Math.floor(parseFloat(threshold) * 1e18));
    const triggered =
      direction === "above"
        ? balance > thresholdWei
        : balance < thresholdWei;

    if (!triggered) return null;

    return {
      type: "balance_threshold",
      blockNumber: Number(blockNumber),
      balance: formatEther(balance),
      threshold,
      direction,
      summary: `Address ${addr} balance is ${formatEther(balance)} PLS, which is ${direction} threshold of ${threshold} PLS`,
    };
  } catch (err) {
    console.warn(`[monitor] balance check failed for ${addr}:`, err);
    return null;
  }
}

async function matchFailedTx(
  conditions: AlertConditions,
  txs: BlockTransaction[],
  blockNumber: bigint,
): Promise<MatchData | null> {
  const addr = conditions.address?.toLowerCase();
  if (!addr) return null;

  const relatedTxs = txs.filter((t) => t.from === addr || t.to === addr);
  if (relatedTxs.length === 0) return null;

  for (const tx of relatedTxs) {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: tx.hash as `0x${string}`,
      });

      if (receipt.status === "reverted") {
        return {
          type: "failed_tx",
          txHash: tx.hash,
          blockNumber: Number(blockNumber),
          from: tx.from,
          to: tx.to ?? undefined,
          summary: `Failed transaction ${tx.hash} involving ${addr} in block ${blockNumber}`,
        };
      }
    } catch (err) {
      console.warn(`[monitor] receipt fetch failed for ${tx.hash}:`, err);
    }
  }

  return null;
}

export { pollBlocks, processBlock };
