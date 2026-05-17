/**
 * Opcode classification helpers — pure functions, easy to unit-test and
 * reuse across multiple components (OpcodeViewer, StepDebugger, GasProfiler).
 */

export type OpcodeCategory =
  | "storage"
  | "memory"
  | "call"
  | "stack"
  | "logging"
  | "hash"
  | "control"
  | "other";

const STORAGE_OPS: ReadonlySet<string> = new Set(["SLOAD", "SSTORE"]);
const MEMORY_OPS: ReadonlySet<string> = new Set([
  "MLOAD",
  "MSTORE",
  "MSTORE8",
  "MSIZE",
  "MCOPY",
]);
const CALL_OPS: ReadonlySet<string> = new Set([
  "CALL",
  "STATICCALL",
  "DELEGATECALL",
  "CALLCODE",
  "CREATE",
  "CREATE2",
  "SELFDESTRUCT",
]);
const HASH_OPS: ReadonlySet<string> = new Set(["SHA3", "KECCAK256"]);
const CONTROL_OPS: ReadonlySet<string> = new Set([
  "JUMP",
  "JUMPI",
  "JUMPDEST",
  "STOP",
  "RETURN",
  "REVERT",
  "INVALID",
]);

const EXPENSIVE_OPS: ReadonlySet<string> = new Set([
  "SSTORE",
  "SLOAD",
  "CREATE",
  "CREATE2",
  "CALL",
  "STATICCALL",
  "DELEGATECALL",
  "CALLCODE",
  "SELFDESTRUCT",
  "LOG0",
  "LOG1",
  "LOG2",
  "LOG3",
  "LOG4",
]);

export const OPCODE_CATEGORY_COLORS: Record<OpcodeCategory, string> = {
  storage: "#f97316",
  memory: "#22c55e",
  call: "#ef4444",
  stack: "#6366f1",
  logging: "#eab308",
  hash: "#06b6d4",
  control: "#64748b",
  other: "#c9d1d9",
};

export function classifyOpcode(op: string): OpcodeCategory {
  if (STORAGE_OPS.has(op)) return "storage";
  if (MEMORY_OPS.has(op)) return "memory";
  if (CALL_OPS.has(op)) return "call";
  if (
    op.startsWith("PUSH") ||
    op.startsWith("DUP") ||
    op.startsWith("SWAP") ||
    op === "POP"
  ) {
    return "stack";
  }
  if (op.startsWith("LOG")) return "logging";
  if (HASH_OPS.has(op)) return "hash";
  if (CONTROL_OPS.has(op)) return "control";
  return "other";
}

export function getOpcodeColor(op: string): string {
  return OPCODE_CATEGORY_COLORS[classifyOpcode(op)];
}

export function isExpensiveOp(op: string): boolean {
  return EXPENSIVE_OPS.has(op);
}
