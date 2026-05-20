export function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

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
  try {
    const wei = BigInt(weiStr);
    const gwei = Number(wei) / 1e9;
    return `${gwei.toFixed(2)} Gwei`;
  } catch {
    return weiStr;
  }
}

export function formatPLS(valuePLS: string): string {
  const num = parseFloat(valuePLS);
  if (num === 0) return "0 PLS";
  if (num < 0.0001) return `${num.toExponential(4)} PLS`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} PLS`;
}

export function renderParamValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
