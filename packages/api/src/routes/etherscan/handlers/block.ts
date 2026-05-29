/**
 * Etherscan `block` module handlers.
 *
 *   getblockreward     — block author + reward components
 *   getblockcountdown  — head-distance + ETA for a future block
 *   getblocknobytime   — closest block to a unix timestamp
 *
 * PulseChain rewards are not exposed by our BlockScout-backed service
 * (the v1 `getblockreward` endpoint isn't wired through), so reward
 * fields are emitted as "0" rather than guessed. Block-by-timestamp
 * needs a dedicated BlockScout call we don't have today — returned as
 * "Not supported" so callers don't quietly receive head.
 */

import { publicClient } from "../../../services/rpc.js";
import { getBlockDetails } from "../../../services/explorer.js";
import {
  etherscanErr,
  etherscanOk,
  type EtherscanResponse,
} from "../envelope.js";

const BLOCKNO_RE = /^[0-9]+$/;
const TIMESTAMP_RE = /^[0-9]+$/;

/** PulseChain target block time; used for countdown ETA. */
const PULSECHAIN_BLOCK_SECONDS = 10;

// ===========================================================================
// getblockreward
// ===========================================================================

interface BlockRewardResult {
  blockNumber: string;
  timeStamp: string;
  blockMiner: string;
  blockReward: string;
  uncles: never[];
  uncleInclusionReward: string;
}

export async function getBlockRewardAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<BlockRewardResult>> {
  const blockno = String(params.blockno ?? "");
  if (!BLOCKNO_RE.test(blockno)) {
    return etherscanErr("Invalid block number");
  }

  try {
    const block = await getBlockDetails(blockno);
    return etherscanOk({
      blockNumber: block.number,
      timeStamp: String(block.timestamp),
      blockMiner: block.miner,
      // PulseChain rewards aren't exposed through our current explorer
      // pipeline; emit "0" rather than fabricate a value.
      blockReward: "0",
      uncles: [],
      uncleInclusionReward: "0",
    });
  } catch {
    return etherscanErr("Upstream temporarily unavailable");
  }
}

// ===========================================================================
// getblockcountdown
// ===========================================================================

interface BlockCountdownResult {
  CurrentBlock: string;
  CountdownBlock: string;
  RemainingBlock: string;
  EstimateTimeInSec: string;
}

export async function getBlockCountdownAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<BlockCountdownResult>> {
  const blocknoStr = String(params.blockno ?? "");
  if (!BLOCKNO_RE.test(blocknoStr)) {
    return etherscanErr("Invalid block number");
  }

  const target = BigInt(blocknoStr);
  let head: bigint;
  try {
    head = await publicClient.getBlockNumber();
  } catch {
    return etherscanErr("Upstream temporarily unavailable");
  }

  if (target <= head) {
    return etherscanErr(
      "Error! Block number already pass",
      "Error! Block number already pass",
    );
  }

  const remaining = target - head;
  const eta = remaining * BigInt(PULSECHAIN_BLOCK_SECONDS);

  return etherscanOk({
    CurrentBlock: head.toString(),
    CountdownBlock: target.toString(),
    RemainingBlock: remaining.toString(),
    EstimateTimeInSec: eta.toString(),
  });
}

// ===========================================================================
// getblocknobytime
// ===========================================================================

/**
 * Requires a BlockScout / RPC call we don't have wired today. Walking
 * the chain by hand is not viable; return "Not supported" so callers
 * can fall back rather than silently receive the head block.
 */
export async function getBlockNoByTimeAction(
  params: Record<string, unknown>,
): Promise<EtherscanResponse<string>> {
  const timestamp = String(params.timestamp ?? "");
  if (!TIMESTAMP_RE.test(timestamp)) {
    return etherscanErr("Invalid timestamp");
  }

  const closest = String(params.closest ?? "before");
  if (closest !== "before" && closest !== "after") {
    return etherscanErr("Invalid closest — must be 'before' or 'after'");
  }

  return etherscanErr("Not supported");
}
