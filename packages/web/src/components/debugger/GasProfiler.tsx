import type {
  GasProfile,
  OpcodeProfile,
  GasEntry,
  FlatGasEntry,
  OpcodeCategory,
} from "../../api/debugger";

// ---------------------------------------------------------------------------
// Color assignments for categories / call types
// ---------------------------------------------------------------------------

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

function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "#8b949e";
}

function getCallTypeColor(type: string): string {
  return CALL_TYPE_COLORS[type] ?? "#8b949e";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatGas(val: number): string {
  return val.toLocaleString();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GasBarChart({ entries }: { entries: GasEntry[] }) {
  // Flatten top-level children and sort by totalGas
  const items = flattenForChart(entries).slice(0, 20);
  const maxGas = items.length > 0 ? items[0]!.totalGas : 1;

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = maxGas > 0 ? (item.totalGas / maxGas) * 100 : 0;
        const color = getCallTypeColor(item.callType);
        return (
          <div key={`${item.address}-${item.function}-${i}`} className="flex items-center gap-3">
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
                style={{ color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
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

function flattenForChart(entries: GasEntry[]): GasEntry[] {
  const result: GasEntry[] = [];
  function walk(e: GasEntry) {
    result.push(e);
    for (const c of e.children) {
      walk(c);
    }
  }
  for (const entry of entries) {
    walk(entry);
  }
  result.sort((a, b) => b.totalGas - a.totalGas);
  return result;
}

function GasTable({ flat }: { flat: FlatGasEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr
            className="border-b"
            style={{ borderColor: "var(--color-border-default)" }}
          >
            <th
              className="text-left py-2 px-3 font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Depth
            </th>
            <th
              className="text-left py-2 px-3 font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Function
            </th>
            <th
              className="text-left py-2 px-3 font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Address
            </th>
            <th
              className="text-left py-2 px-3 font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Type
            </th>
            <th
              className="text-right py-2 px-3 font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Gas Used
            </th>
            <th
              className="text-right py-2 px-3 font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {flat.map((entry, i) => (
            <tr
              key={i}
              className="border-b"
              style={{ borderColor: "var(--color-border-muted)" }}
            >
              <td
                className="py-2 px-3 font-mono"
                style={{ color: "var(--color-text-muted)" }}
              >
                {entry.depth}
              </td>
              <td
                className="py-2 px-3 font-mono"
                style={{
                  color: "var(--color-text-primary)",
                  paddingLeft: `${entry.depth * 12 + 12}px`,
                }}
              >
                {entry.function}
              </td>
              <td
                className="py-2 px-3 font-mono"
                style={{ color: "var(--color-accent)" }}
                title={entry.address}
              >
                {truncateAddress(entry.address)}
              </td>
              <td className="py-2 px-3">
                <span
                  className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${getCallTypeColor(entry.callType)}20`,
                    color: getCallTypeColor(entry.callType),
                  }}
                >
                  {entry.callType}
                </span>
              </td>
              <td
                className="py-2 px-3 text-right font-mono"
                style={{ color: "var(--color-text-primary)" }}
              >
                {formatGas(entry.gasUsed)}
              </td>
              <td
                className="py-2 px-3 text-right font-mono"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {entry.percentage.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CallTypeBreakdown({ byCallType }: { byCallType: Record<string, number> }) {
  const entries = Object.entries(byCallType).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([type, gas]) => {
        const pct = total > 0 ? (gas / total) * 100 : 0;
        const color = getCallTypeColor(type);
        return (
          <div
            key={type}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: `${color}15`,
              border: `1px solid ${color}30`,
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

function OpcodeCategoryBreakdown({
  categories,
}: {
  categories: OpcodeCategory[];
}) {
  const totalGas = categories.reduce((sum, c) => sum + c.gas, 0);

  return (
    <div>
      {/* Stacked bar */}
      <div
        className="h-8 rounded-lg overflow-hidden flex mb-3"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        {categories.map((cat) => {
          const pct = totalGas > 0 ? (cat.gas / totalGas) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={cat.category}
              className="h-full transition-all relative group"
              style={{
                width: `${pct}%`,
                backgroundColor: getCategoryColor(cat.category),
                opacity: 0.75,
              }}
              title={`${cat.category}: ${formatGas(cat.gas)} gas (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Pills */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const color = getCategoryColor(cat.category);
          return (
            <div
              key={cat.category}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{
                backgroundColor: `${color}20`,
                border: `1px solid ${color}40`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium" style={{ color }}>
                {cat.category}
              </span>
              <span
                className="font-mono"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {cat.percentage.toFixed(1)}%
              </span>
              <span
                className="font-mono"
                style={{ color: "var(--color-text-muted)" }}
              >
                ({cat.count})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GasProfilerProps {
  gasProfile: GasProfile;
  opcodeProfile: OpcodeProfile | null;
}

export default function GasProfiler({
  gasProfile,
  opcodeProfile,
}: GasProfilerProps) {
  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Gas Profile
          </h3>
          <span
            className="text-sm font-mono font-semibold px-3 py-1 rounded"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            {formatGas(gasProfile.totalGas)} total gas
          </span>
        </div>

        {/* Call type breakdown */}
        <div className="mb-4">
          <h4
            className="text-xs font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Gas by Call Type
          </h4>
          <CallTypeBreakdown byCallType={gasProfile.byCallType} />
        </div>
      </div>

      {/* Bar chart */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          Gas by Function
        </h3>
        <GasBarChart entries={gasProfile.entries} />
      </div>

      {/* Table */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border-default)",
        }}
      >
        <h3
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--color-text-primary)" }}
        >
          Detailed Breakdown
        </h3>
        <GasTable flat={gasProfile.flat} />
      </div>

      {/* Opcode categories */}
      {opcodeProfile && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Opcode Gas Distribution
            </h3>
            <span
              className="text-xs font-mono"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {formatGas(opcodeProfile.totalGas)} gas across{" "}
              {opcodeProfile.categories.reduce((s, c) => s + c.count, 0).toLocaleString()} ops
            </span>
          </div>
          <OpcodeCategoryBreakdown categories={opcodeProfile.categories} />

          {/* Top expensive ops */}
          {opcodeProfile.topExpensive.length > 0 && (
            <div className="mt-4">
              <h4
                className="text-xs font-medium mb-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Top 10 Most Expensive Operations
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: "var(--color-border-default)" }}
                    >
                      <th
                        className="text-left py-1.5 px-2 font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Step
                      </th>
                      <th
                        className="text-left py-1.5 px-2 font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        PC
                      </th>
                      <th
                        className="text-left py-1.5 px-2 font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Opcode
                      </th>
                      <th
                        className="text-right py-1.5 px-2 font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        Gas Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {opcodeProfile.topExpensive.map((op, i) => (
                      <tr
                        key={i}
                        className="border-b"
                        style={{ borderColor: "var(--color-border-muted)" }}
                      >
                        <td
                          className="py-1.5 px-2 font-mono"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          #{op.step}
                        </td>
                        <td
                          className="py-1.5 px-2 font-mono"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {op.pc}
                        </td>
                        <td className="py-1.5 px-2 font-mono font-semibold">
                          <OpcodeLabel op={op.op} />
                        </td>
                        <td
                          className="py-1.5 px-2 text-right font-mono font-semibold"
                          style={{ color: "var(--color-warning)" }}
                        >
                          {formatGas(op.gasCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OpcodeLabel({ op }: { op: string }) {
  const color = getOpcodeColor(op);
  return <span style={{ color }}>{op}</span>;
}

function getOpcodeColor(op: string): string {
  if (["SLOAD", "SSTORE"].includes(op)) return "#f97316";
  if (["MLOAD", "MSTORE", "MSTORE8"].includes(op)) return "#22c55e";
  if (["CALL", "STATICCALL", "DELEGATECALL", "CREATE", "CREATE2"].includes(op))
    return "#ef4444";
  if (["LOG0", "LOG1", "LOG2", "LOG3", "LOG4"].includes(op)) return "#eab308";
  return "var(--color-text-primary)";
}
