import { formatGas, getCallTypeColor } from "./colors";

export function CallTypeBreakdown({
  byCallType,
}: {
  byCallType: Record<string, number>;
}) {
  const entries = Object.entries(byCallType).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="flex flex-wrap gap-inline">
      {entries.map(([type, gas]) => {
        const pct = total > 0 ? (gas / total) * 100 : 0;
        const color = getCallTypeColor(type);
        return (
          <div
            key={type}
            className="flex items-center gap-inline px-3 py-2 rounded-lg"
            style={{
              backgroundColor: `${color}15`,
              boxShadow: `0 0 0 1px ${color}30`,
            }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span
              className="text-xs font-mono font-semibold"
              style={{ color }}
            >
              {type}
            </span>
            <span
              className="text-xs font-mono"
              style={{ color: "var(--color-text-primary)" }}
            >
              {formatGas(gas)}
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              ({pct.toFixed(1)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}
