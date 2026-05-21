// Call-type tinting for the step debugger's call tree. Opcode-token coloring
// itself comes from the SDK's `getOpcodeColor` (consumed at the import sites
// directly); only call-type background/border tints live here.

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
