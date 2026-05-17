import type { Address, Hex } from "viem";
import type { Log, TokenApproval, TraceFrame } from "../types.js";
import { walkCallTree } from "../traversal/walkCallTree.js";

/**
 * keccak256("Approval(address,address,uint256)"). Same hash for ERC-20 and
 * ERC-721 — disambiguated by topic count. ERC-20 indexes owner/spender (3
 * topics, value in `data`); ERC-721 also indexes tokenId (4 topics).
 */
const APPROVAL_TOPIC: Hex =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

const TOPIC_HEX_LENGTH = 66;

function decodeErc20Approval(
  log: Log,
  logIndex: number,
): TokenApproval | null {
  if (log.topics.length !== 3) return null;
  if (log.topics[0] !== APPROVAL_TOPIC) return null;
  const ownerTopic = log.topics[1]!;
  const spenderTopic = log.topics[2]!;
  if (ownerTopic.length !== TOPIC_HEX_LENGTH) return null;
  if (spenderTopic.length !== TOPIC_HEX_LENGTH) return null;

  let value: bigint;
  try {
    value = BigInt(log.data);
  } catch {
    return null;
  }

  return {
    token: log.address,
    owner: (`0x${ownerTopic.slice(-40)}`).toLowerCase() as Address,
    spender: (`0x${spenderTopic.slice(-40)}`).toLowerCase() as Address,
    value,
    logIndex,
  };
}

/**
 * Extract ERC-20 Approval events from a call trace. Pre-order walk, skipping
 * reverted subtrees (their logs are rolled back on-chain and don't appear in
 * receipts).
 *
 * ERC-721 Approval shares the topic hash but indexes tokenId so its log has
 * 4 topics — filtered out here. Use `parseEvents` (forthcoming) for the
 * generic by-signature decoder.
 *
 * `logIndex` reflects position in the successful log stream and increments
 * for every log seen (including non-Approval ones we skip), matching the
 * `parseTokenDeltas` convention so the two parsers' indices are comparable.
 */
export function parseApprovals(root: TraceFrame): TokenApproval[] {
  const approvals: TokenApproval[] = [];
  let logIndex = 0;

  walkCallTree(root, {
    enter(frame) {
      if (frame.error) return "skip";
      if (!frame.logs) return;
      for (const log of frame.logs) {
        const approval = decodeErc20Approval(log, logIndex);
        if (approval) approvals.push(approval);
        logIndex++;
      }
    },
  });

  return approvals;
}
