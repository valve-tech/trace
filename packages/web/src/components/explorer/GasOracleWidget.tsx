import { useQuery } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { fetchGasOracle, type TierName, type Trend } from "../../api/gas";

const TIERS: { key: TierName; label: string }[] = [
  { key: "slow", label: "Slow" },
  { key: "standard", label: "Standard" },
  { key: "fast", label: "Fast" },
  { key: "instant", label: "Instant" },
];

const TREND: Record<Trend, { icon: string; color: string }> = {
  rising: { icon: "heroicons:arrow-trending-up", color: "var(--color-warning)" },
  falling: { icon: "heroicons:arrow-trending-down", color: "var(--color-success)" },
  stable: { icon: "heroicons:minus", color: "var(--color-text-muted)" },
};

/** wei decimal string → integer gwei with thousands separators. */
function gwei(wei: string): string {
  try {
    return Math.round(Number(BigInt(wei)) / 1e9).toLocaleString();
  } catch {
    return "—";
  }
}

export function GasOracleWidget() {
  const { data, status } = useQuery({
    queryKey: ["gas-oracle"],
    queryFn: fetchGasOracle,
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-stack">
        <div className="flex items-center gap-inline">
          <Icon
            icon="heroicons:fire"
            className="w-4 h-4"
            style={{ color: "var(--color-accent)" }}
          />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Priority Fee
          </span>
          <span
            className="text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            gwei · mempool-aware
          </span>
        </div>
        {data && (
          <div
            className="flex items-center gap-row text-[11px] font-mono"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span className="flex items-center gap-tight">
              base {gwei(data.baseFee)}
              <Icon
                icon={TREND[data.baseFeeTrend].icon}
                className="w-3 h-3"
                style={{ color: TREND[data.baseFeeTrend].color }}
              />
            </span>
            <span>{data.mempool.pendingCount} pending</span>
          </div>
        )}
      </div>

      {status === "pending" && (
        <div
          className="h-12 flex items-center text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          Loading gas tiers…
        </div>
      )}

      {status === "error" && (
        <div
          className="h-12 flex items-center text-xs"
          style={{ color: "var(--color-danger)" }}
        >
          Gas oracle unavailable
        </div>
      )}

      {status === "success" && (
        <div className="grid grid-cols-4 gap-row">
          {TIERS.map((t) => (
            <div
              key={t.key}
              className="bs-muted p-2.5 flex flex-col gap-tight"
            >
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--color-text-muted)" }}
              >
                {t.label}
              </span>
              <span
                className="font-mono text-base font-semibold tabular-nums"
                style={{ color: "var(--color-text-primary)" }}
              >
                {gwei(data.tiers[t.key].maxPriorityFeePerGas)}
              </span>
              <span
                className="font-mono text-[10px] tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
              >
                max {gwei(data.tiers[t.key].maxFeePerGas)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
