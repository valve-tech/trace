import type { GasProfile, OpcodeProfile } from "../../api/debugger";
import { formatGas } from "./GasProfiler/colors";
import { GasBarChart } from "./GasProfiler/GasBarChart";
import { GasTable } from "./GasProfiler/GasTable";
import { CallTypeBreakdown } from "./GasProfiler/CallTypeBreakdown";
import { OpcodeCategoryBreakdown } from "./GasProfiler/OpcodeCategoryBreakdown";
import { TopExpensiveOps } from "./GasProfiler/TopExpensiveOps";

interface GasProfilerProps {
  gasProfile: GasProfile;
  opcodeProfile: OpcodeProfile | null;
}

const cardStyle = {
  backgroundColor: "var(--color-bg-card)",
  borderColor: "var(--color-border-default)",
};

function Card({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4" style={cardStyle}>
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
        {trailing}
      </div>
      {children}
    </div>
  );
}

export default function GasProfiler({
  gasProfile,
  opcodeProfile,
}: GasProfilerProps) {
  return (
    <div className="space-y-4">
      <Card
        title="Gas Profile"
        trailing={
          <span
            className="text-sm font-mono font-semibold px-3 py-1 rounded"
            style={{
              backgroundColor: "var(--color-accent-muted)",
              color: "var(--color-accent)",
            }}
          >
            {formatGas(gasProfile.totalGas)} total gas
          </span>
        }
      >
        <div className="mb-4">
          <h4
            className="text-xs font-medium mb-2"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Gas by Call Type
          </h4>
          <CallTypeBreakdown byCallType={gasProfile.byCallType} />
        </div>
      </Card>

      <Card title="Gas by Function">
        <GasBarChart entries={gasProfile.entries} />
      </Card>

      <Card title="Detailed Breakdown">
        <GasTable flat={gasProfile.flat} />
      </Card>

      {opcodeProfile && (
        <Card
          title="Opcode Gas Distribution"
          trailing={
            <span
              className="text-xs font-mono"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {formatGas(opcodeProfile.totalGas)} gas across{" "}
              {opcodeProfile.categories
                .reduce((s, c) => s + c.count, 0)
                .toLocaleString()}{" "}
              ops
            </span>
          }
        >
          <OpcodeCategoryBreakdown categories={opcodeProfile.categories} />
          {opcodeProfile.topExpensive.length > 0 && (
            <TopExpensiveOps ops={opcodeProfile.topExpensive} />
          )}
        </Card>
      )}
    </div>
  );
}
