import type {
  AnalyzeRisksOptions,
  RiskFlag,
  TraceFrame,
} from "../types.js";

/**
 * A risk rule inspects a single frame and either returns a partial flag or
 * null. Rules run during the call-tree walk in `analyzeRisks`; each frame is
 * passed through every registered rule. The `reverted` field is stamped on
 * by the analyzer — rules don't see or set it. Rules must be pure (no I/O)
 * and cheap, since they run once per frame.
 */
export type RiskRule = (
  frame: TraceFrame,
  depth: number,
  childIndex: number,
  options: AnalyzeRisksOptions,
) => Omit<RiskFlag, "reverted"> | null;

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
  if (frame.type !== "DELEGATECALL") return null;
  if (frame.to === null) return null;
  if (whitelist?.has(frame.to)) return null;
  return {
    type: "DELEGATECALL_UNRECOGNIZED",
    severity: "danger",
    message: `DELEGATECALL to non-whitelisted address ${frame.to}`,
    address: frame.to,
    depth,
    childIndex,
  };
};

/** Built-in rule registry. Order is preserved in the output `RiskFlag[]`. */
export const BUILTIN_RULES: readonly RiskRule[] = [delegatecallUnrecognized];
