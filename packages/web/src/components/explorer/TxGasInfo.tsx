/**
 * Compact gas + tx-type readout for transaction lists. Surfaces the fields
 * the node actually orders on — the priority tip (maxPriorityFeePerGas) and
 * the fee cap (maxFeePerGas) — plus the EIP tx-type, so a sorted list makes
 * the inclusion logic visible at a glance.
 */

interface Props {
  /** viem tx-type string: "legacy" | "eip2930" | "eip1559" | "eip4844" | … */
  type: string;
  gasPrice: string | null;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  className?: string;
}

/** Short human label for a viem tx-type string. */
function typeLabel(type: string): string {
  switch (type) {
    case "legacy":
      return "Legacy";
    case "eip2930":
      return "EIP-2930";
    case "eip1559":
      return "EIP-1559";
    case "eip4844":
      return "Blob (4844)";
    case "eip7702":
      return "EIP-7702";
    default:
      return type;
  }
}

/** wei decimal string → gwei, trimmed. Returns null for null/0-ish input. */
function toGwei(wei: string | null): string | null {
  if (wei == null) return null;
  try {
    const gwei = Number(BigInt(wei)) / 1e9;
    if (!isFinite(gwei)) return null;
    return gwei.toLocaleString(undefined, { maximumFractionDigits: 3 });
  } catch {
    return null;
  }
}

export function TxGasInfo({
  type,
  gasPrice,
  maxFeePerGas,
  maxPriorityFeePerGas,
  className = "",
}: Props) {
  const tip = toGwei(maxPriorityFeePerGas);
  const cap = toGwei(maxFeePerGas);
  const legacy = toGwei(gasPrice);

  return (
    <span
      className={`inline-flex items-center gap-tight font-mono text-[10px] theme-text-muted ${className}`}
    >
      <span
        className="px-1.5 py-0.5 uppercase tracking-wider font-semibold shrink-0 theme-tertiary-bg theme-text-secondary"
      >
        {typeLabel(type)}
      </span>
      {tip != null || cap != null ? (
        <span className="whitespace-nowrap">
          {tip != null && <>tip {tip}</>}
          {tip != null && cap != null && " / "}
          {cap != null && <>cap {cap}</>} gwei
        </span>
      ) : legacy != null ? (
        <span className="whitespace-nowrap">{legacy} gwei</span>
      ) : null}
    </span>
  );
}
