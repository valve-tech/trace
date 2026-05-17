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

/** Built-in rule registry. Order is preserved in the output `RiskFlag[]`. */
export const BUILTIN_RULES: readonly RiskRule[] = [
  delegatecallUnrecognized,
  largeApproval,
];
