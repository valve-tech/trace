import type { Address, Hex } from "viem";
import type { Log, TokenDelta, TraceFrame } from "../types.js";
import { walkCallTree } from "../traversal/walkCallTree.js";

/**
 * keccak256("Transfer(address,address,uint256)"). Shared by ERC-20 and
 * ERC-721, but the two are disambiguated by topic count — ERC-721 indexes
 * the tokenId so its log has 4 topics, ERC-20 has 3 (value in `data`).
 */
const TRANSFER_TOPIC: Hex =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOPIC_HEX_LENGTH = 66; // "0x" + 64 hex chars

function decodeErc20Transfer(
  log: Log,
  logIndex: number,
): TokenDelta | null {
  if (log.topics.length !== 3) return null;
  if (log.topics[0] !== TRANSFER_TOPIC) return null;
  // Indices 1 and 2 are guaranteed present by the length check above.
  const fromTopic = log.topics[1]!;
  const toTopic = log.topics[2]!;
  if (fromTopic.length !== TOPIC_HEX_LENGTH) return null;
  if (toTopic.length !== TOPIC_HEX_LENGTH) return null;

  let value: bigint;
  try {
    value = BigInt(log.data);
  } catch {
    return null;
  }

  return {
    token: log.address,
    from: (`0x${fromTopic.slice(-40)}`).toLowerCase() as Address,
    to: (`0x${toTopic.slice(-40)}`).toLowerCase() as Address,
    value,
    logIndex,
  };
}

/**
 * Extract ERC-20 Transfer events from a call trace. Walks the tree depth-first
 * and collects logs attached to each frame (populated by `withLog: true`
 * callTracer mode). Reverted call frames and their entire subtrees are
 * skipped — those logs are rolled back on-chain and would not appear in the
 * transaction receipt.
 *
 * ERC-721 Transfer events share the same topic hash but have 4 topics
 * (tokenId is indexed); they are filtered out. ERC-1155 transfers use
 * different topic hashes and are not decoded here.
 *
 * Returns an empty array if the trace contains no logs or no Transfer events.
 * `logIndex` reflects the position within the *successful* log stream
 * (matching what a receipt would contain), not the raw walk order.
 */
export function parseTokenDeltas(root: TraceFrame): TokenDelta[] {
  const deltas: TokenDelta[] = [];
  let logIndex = 0;

  walkCallTree(root, {
    enter(frame) {
      if (frame.error) return "skip";
      if (!frame.logs) return;
      for (const log of frame.logs) {
        const delta = decodeErc20Transfer(log, logIndex);
        if (delta) deltas.push(delta);
        logIndex++;
      }
    },
  });

  return deltas;
}
