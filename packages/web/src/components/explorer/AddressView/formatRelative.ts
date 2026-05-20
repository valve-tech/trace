export function formatRelativeTimestamp(ts: string): string {
  if (!ts) return "";
  const d = new Date(Number(ts) * 1000);
  const ago = Math.floor((Date.now() - d.getTime()) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
  return `${Math.floor(ago / 86400)}d ago`;
}
