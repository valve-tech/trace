import { formatGwei as formatGweiExact } from "../../../lib/format/tokenAmount";

export { truncateAddr, formatPLS } from "../format";

export function formatTimestamp(ts: number | null): string {
  if (!ts) return "Unknown";
  const d = new Date(ts * 1000);
  const ago = Math.floor((Date.now() - d.getTime()) / 1000);
  let agoStr = "";
  if (ago < 60) agoStr = `${ago}s ago`;
  else if (ago < 3600) agoStr = `${Math.floor(ago / 60)}m ago`;
  else if (ago < 86400) agoStr = `${Math.floor(ago / 3600)}h ago`;
  else agoStr = `${Math.floor(ago / 86400)}d ago`;
  return `${d.toISOString().replace("T", " ").replace("Z", " UTC")} (${agoStr})`;
}

export function formatGwei(weiStr: string): string {
  // Exact wei→gwei (no float); fall back to the raw string on garbage input.
  return `${formatGweiExact(weiStr) ?? weiStr} Gwei`;
}

export function renderParamValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
