const CATEGORY_COLORS: Record<string, string> = {
  Storage: "#f97316",
  "External Calls": "#ef4444",
  Memory: "#22c55e",
  Compute: "#8B5CF6",
  Hashing: "#06b6d4",
  Stack: "#6366f1",
  Logging: "#eab308",
  "Control Flow": "#64748b",
  Environment: "#ec4899",
};

const CALL_TYPE_COLORS: Record<string, string> = {
  CALL: "#8B5CF6",
  STATICCALL: "#38bdf8",
  DELEGATECALL: "#fbbf24",
  CREATE: "#3fb950",
  CREATE2: "#3fb950",
  CALLCODE: "#fb923c",
};

export function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#8b949e";
}

export function getCallTypeColor(type: string): string {
  return CALL_TYPE_COLORS[type] ?? "#8b949e";
}

export function getOpcodeColor(op: string): string {
  if (["SLOAD", "SSTORE"].includes(op)) return "#f97316";
  if (["MLOAD", "MSTORE", "MSTORE8"].includes(op)) return "#22c55e";
  if (
    ["CALL", "STATICCALL", "DELEGATECALL", "CREATE", "CREATE2"].includes(op)
  )
    return "#ef4444";
  if (["LOG0", "LOG1", "LOG2", "LOG3", "LOG4"].includes(op)) return "#eab308";
  return "var(--color-text-primary)";
}

export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatGas(val: number): string {
  return val.toLocaleString();
}
