import type { GasEntry } from "../../../api/debugger";
import { formatGas, getCallTypeColor } from "./colors";

function flattenForChart(entries: GasEntry[]): GasEntry[] {
  const result: GasEntry[] = [];
  function walk(e: GasEntry) {
    result.push(e);
    for (const c of e.children) walk(c);
  }
  for (const entry of entries) walk(entry);
  result.sort((a, b) => b.totalGas - a.totalGas);
  return result;
}

export function GasBarChart({ entries }: { entries: GasEntry[] }) {
  const items = flattenForChart(entries).slice(0, 20);
  const maxGas = items.length > 0 ? items[0]!.totalGas : 1;

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = maxGas > 0 ? (item.totalGas / maxGas) * 100 : 0;
        const color = getCallTypeColor(item.callType);
        return (
          <div
            key={`${item.address}-${item.function}-${i}`}
            className="flex items-center gap-3"
          >
            <div
              className="w-28 flex-shrink-0 text-xs truncate text-right font-mono"
              style={{ color: "var(--color-text-primary)" }}
              title={item.function}
            >
              {item.function}
            </div>
            <div
              className="flex-1 h-6 rounded overflow-hidden relative"
              style={{ backgroundColor: "var(--color-bg-primary)" }}
            >
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${Math.max(pct, 1)}%`,
                  backgroundColor: color,
                  opacity: 0.7,
                }}
              />
              <span
                className="absolute inset-y-0 left-2 flex items-center text-xs font-mono font-medium"
                style={{
                  color: "#fff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                }}
              >
                {formatGas(item.totalGas)}
              </span>
            </div>
            <span
              className="w-14 text-xs text-right flex-shrink-0"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {item.percentage.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
