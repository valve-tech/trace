// Color palette and visual constants for the step debugger UI.
//
// `OPCODE_COLORS` and `getOpcodeColor` color opcode tokens by category;
// `CALL_TYPE_BG` / `CALL_TYPE_BORDER` tint call-tree rows by call type.
// The web's palette intentionally differs from the SDK's default
// (`OPCODE_CATEGORY_COLORS`). Swap when a theming refactor is done.

export const OPCODE_COLORS: Record<string, string> = {
  // Stack
  PUSH: "#60A5FA", POP: "#60A5FA", DUP: "#60A5FA", SWAP: "#60A5FA",
  // Memory
  MLOAD: "#34D399", MSTORE: "#34D399", MSTORE8: "#34D399", MSIZE: "#34D399",
  // Storage
  SLOAD: "#F59E0B", SSTORE: "#F59E0B", TLOAD: "#F59E0B", TSTORE: "#F59E0B",
  // Calls
  CALL: "#EF4444", DELEGATECALL: "#EF4444", STATICCALL: "#EF4444",
  CREATE: "#EF4444", CREATE2: "#EF4444", CALLCODE: "#EF4444",
  // Logs
  LOG0: "#A78BFA", LOG1: "#A78BFA", LOG2: "#A78BFA", LOG3: "#A78BFA", LOG4: "#A78BFA",
  // Control
  JUMP: "#94A3B8", JUMPI: "#94A3B8", JUMPDEST: "#94A3B8",
  RETURN: "#10B981", REVERT: "#EF4444", STOP: "#10B981",
  SELFDESTRUCT: "#EF4444", INVALID: "#EF4444",
};

export function getOpcodeColor(op: string): string {
  if (op.startsWith("PUSH")) return OPCODE_COLORS.PUSH!;
  if (op.startsWith("DUP")) return OPCODE_COLORS.DUP!;
  if (op.startsWith("SWAP")) return OPCODE_COLORS.SWAP!;
  if (op.startsWith("LOG")) return OPCODE_COLORS.LOG0!;
  return OPCODE_COLORS[op] ?? "#94A3B8";
}

// Background colors for call types — subtle tints.
// Red/amber reserved for errors — use cool palette for call types.
export const CALL_TYPE_BG: Record<string, string> = {
  CALL: "rgba(96, 165, 250, 0.08)",         // blue — standard external call
  STATICCALL: "rgba(52, 211, 153, 0.08)",   // green — read-only
  DELEGATECALL: "rgba(167, 139, 250, 0.08)",// purple — proxy/delegate
  CALLCODE: "rgba(167, 139, 250, 0.08)",    // purple
  CREATE: "rgba(56, 182, 194, 0.08)",       // teal — deployment
  CREATE2: "rgba(56, 182, 194, 0.08)",      // teal
  root: "transparent",
};

export const CALL_TYPE_BORDER: Record<string, string> = {
  CALL: "rgba(96, 165, 250, 0.4)",
  STATICCALL: "rgba(52, 211, 153, 0.4)",
  DELEGATECALL: "rgba(167, 139, 250, 0.4)",
  CALLCODE: "rgba(167, 139, 250, 0.4)",
  CREATE: "rgba(56, 182, 194, 0.4)",
  CREATE2: "rgba(56, 182, 194, 0.4)",
  root: "transparent",
};
