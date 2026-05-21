import type { CallType } from "../../types.js";

export interface CallTypeStyle {
  bg: string;
  text: string;
}

export const DEFAULT_CALL_TYPE_COLORS: Record<CallType, CallTypeStyle> = {
  CALL: { bg: "rgba(139, 92, 246, 0.15)", text: "#8B5CF6" },
  STATICCALL: { bg: "rgba(56, 189, 248, 0.15)", text: "#38bdf8" },
  DELEGATECALL: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24" },
  CALLCODE: { bg: "rgba(251, 146, 60, 0.15)", text: "#fb923c" },
  CREATE: { bg: "rgba(63, 185, 80, 0.15)", text: "#3fb950" },
  CREATE2: { bg: "rgba(63, 185, 80, 0.15)", text: "#3fb950" },
  SELFDESTRUCT: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
};

const UNKNOWN_TYPE_STYLE: CallTypeStyle = {
  bg: "rgba(139, 148, 158, 0.15)",
  text: "#8b949e",
};

export function getCallTypeStyle(type: CallType): CallTypeStyle {
  return DEFAULT_CALL_TYPE_COLORS[type] ?? UNKNOWN_TYPE_STYLE;
}
