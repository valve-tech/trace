export function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatPLS(valuePLS: string): string {
  const num = parseFloat(valuePLS);
  if (num === 0) return "0 PLS";
  if (num < 0.0001) return `${num.toExponential(4)} PLS`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} PLS`;
}
