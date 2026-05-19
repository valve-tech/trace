import type { Address, Hex } from "viem";
import type {
  AnalyzeRisksOptions,
  Log,
  RiskFlag,
  TraceFrame,
} from "../types.js";

/**
 * A risk rule inspects a single frame and returns zero or more findings. Rules
 * run during the call-tree walk in `analyzeRisks`; each frame is passed through
 * every registered rule. The `reverted` field is stamped on by the analyzer —
 * rules don't see or set it. Rules must be pure (no I/O) and cheap, since they
 * run once per frame.
 *
 * Returning an array (vs. a single flag) lets log-based rules report every
 * matching event on a frame — a router that emits N `Approval`s shouldn't
 * collapse into one finding.
 */
export type RiskRule = (
  frame: TraceFrame,
  depth: number,
  childIndex: number,
  options: AnalyzeRisksOptions,
) => Omit<RiskFlag, "reverted">[];

/**
 * Flag any DELEGATECALL whose target is not in the user-supplied whitelist.
 * Rationale: DELEGATECALL executes the callee's code in the caller's storage
 * context, giving the callee full authority over the caller's state. A
 * delegate target that isn't explicitly trusted is a high-severity finding —
 * the canonical proxy-implementation upgrade exploit shape.
 *
 * When no whitelist is supplied every delegatecall is flagged; consumers can
 * suppress known-good implementations by passing them in.
 */
export const delegatecallUnrecognized: RiskRule = (
  frame,
  depth,
  childIndex,
  { whitelist },
) => {
  if (frame.type !== "DELEGATECALL") return [];
  if (frame.to === null) return [];
  if (whitelist?.has(frame.to)) return [];
  return [{
    type: "DELEGATECALL_UNRECOGNIZED",
    severity: "danger",
    message: `DELEGATECALL to non-whitelisted address ${frame.to}`,
    address: frame.to,
    depth,
    childIndex,
  }];
};

const APPROVAL_TOPIC: Hex =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const TOPIC_HEX_LENGTH = 66;
const UINT256_MAX = 2n ** 256n - 1n;

function decodeApprovalValue(log: Log): bigint | null {
  if (log.topics.length !== 3) return null;
  if (log.topics[0] !== APPROVAL_TOPIC) return null;
  if (log.topics[1]!.length !== TOPIC_HEX_LENGTH) return null;
  if (log.topics[2]!.length !== TOPIC_HEX_LENGTH) return null;
  try {
    return BigInt(log.data);
  } catch {
    return null;
  }
}

function spenderFromApproval(log: Log): Address {
  return (`0x${log.topics[2]!.slice(-40)}`).toLowerCase() as Address;
}

/**
 * Flag any ERC-20 Approval whose value is at or above the configured
 * threshold. Default threshold is `2n ** 256n - 1n` (literal "unlimited"
 * approval, the canonical phishing footgun). Pass
 * `options.largeApprovalThreshold` to lower it — `2n ** 128n` catches the
 * fake-unlimited patterns malicious frontends use to dodge naive
 * detection.
 *
 * ERC-721 Approval is filtered out by topic count (4 topics vs ERC-20's 3).
 * The `address` on the resulting flag is the spender — the party being
 * granted control — since that's what consumers care about for review.
 */
export const largeApproval: RiskRule = (
  frame,
  depth,
  childIndex,
  { largeApprovalThreshold },
) => {
  if (!frame.logs) return [];
  const threshold = largeApprovalThreshold ?? UINT256_MAX;
  const flags: Omit<RiskFlag, "reverted">[] = [];
  for (const log of frame.logs) {
    const value = decodeApprovalValue(log);
    if (value === null) continue;
    if (value < threshold) continue;
    const spender = spenderFromApproval(log);
    flags.push({
      type: "LARGE_APPROVAL",
      severity: "warning",
      message: `Large ERC-20 approval to ${spender} (value ${value})`,
      address: spender,
      depth,
      childIndex,
    });
  }
  return flags;
};

const TRANSFER_TOPIC: Hex =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function decodeTransferRecipient(log: Log): Address | null {
  // Matches the ERC-20 shape used by parseTokenDeltas: topic[0] = Transfer,
  // 3 topics total, both addr topics zero-padded to 32 bytes. We don't need
  // the value — only the destination — so skip BigInt parsing.
  if (log.topics.length !== 3) return null;
  if (log.topics[0] !== TRANSFER_TOPIC) return null;
  const toTopic = log.topics[2]!;
  if (toTopic.length !== TOPIC_HEX_LENGTH) return null;
  return (`0x${toTopic.slice(-40)}`).toLowerCase() as Address;
}

/**
 * Flag ERC-20 Transfer events whose recipient is a token contract — funds
 * sent to a token's own contract address are functionally burned, as the
 * token contract has no mechanism to forward or recover them.
 *
 * Two cases are detected:
 *  1. Self-transfer: `to === log.address` (sending tokenA to tokenA). Caught
 *     unconditionally — it's a syntactic check, no external knowledge needed.
 *  2. Cross-token: `to` is a different token contract (sending tokenA to
 *     tokenB). Caught only when the consumer provides
 *     `options.classifyAddress`, since the SDK has no built-in registry of
 *     token contracts to consult. A typical consumer wires this to a
 *     `code(to).length > 0` + ERC-165/EIP-1820 check, or a token-list lookup.
 *
 * Severity is `warning` (not `danger`) because while the funds are unrecoverable,
 * the action is observable and self-inflicted — there's no exploit involved.
 * ERC-721/1155 share the topic hash but have different topic shapes; this
 * rule deliberately matches only the ERC-20 shape via topic-count filter.
 */
export const tokenSentToTokenContract: RiskRule = (
  frame,
  depth,
  childIndex,
  { classifyAddress },
) => {
  if (!frame.logs) return [];
  const flags: Omit<RiskFlag, "reverted">[] = [];
  for (const log of frame.logs) {
    const to = decodeTransferRecipient(log);
    if (to === null) continue;

    const isSelfTransfer = to === log.address.toLowerCase();
    const isOtherTokenContract = !isSelfTransfer && (classifyAddress?.(to) ?? false);
    if (!isSelfTransfer && !isOtherTokenContract) continue;

    flags.push({
      type: "TOKEN_SENT_TO_TOKEN_CONTRACT",
      severity: "warning",
      message: isSelfTransfer
        ? `ERC-20 Transfer to token's own contract ${to} (funds unrecoverable)`
        : `ERC-20 Transfer to a different token contract ${to} (funds unrecoverable)`,
      address: to,
      depth,
      childIndex,
    });
  }
  return flags;
};

/** Built-in rule registry. Order is preserved in the output `RiskFlag[]`. */
export const BUILTIN_RULES: readonly RiskRule[] = [
  delegatecallUnrecognized,
  largeApproval,
  tokenSentToTokenContract,
];
