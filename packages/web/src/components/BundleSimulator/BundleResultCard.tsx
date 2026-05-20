import type { SimulationResult } from "../../types";
import { StatusBadge } from "./StatusBadge";

export function BundleResultCard({
  result,
  index,
}: {
  result: SimulationResult;
  index: number;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border-default)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h4
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 text-[10px] font-bold"
            style={{
              backgroundColor: result.success
                ? "var(--color-success-muted)"
                : "var(--color-danger-muted)",
              color: result.success
                ? "var(--color-success)"
                : "var(--color-danger)",
            }}
          >
            {index + 1}
          </span>
          Transaction #{index + 1}
        </h4>
        <StatusBadge success={result.success} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span style={{ color: "var(--color-text-secondary)" }}>Gas Used</span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-primary)",
            }}
          >
            {BigInt(result.gasUsed).toLocaleString()}
          </span>
        </div>

        {result.returnData && result.returnData !== "0x" && (
          <div>
            <span
              className="text-xs block mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Return Data
            </span>
            <span
              className="text-xs break-all block"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
              }}
            >
              {result.returnData}
            </span>
          </div>
        )}

        {result.revertReason && (
          <div
            className="p-2 rounded-md mt-2"
            style={{ backgroundColor: "var(--color-danger-muted)" }}
          >
            <span
              className="text-xs font-medium block mb-0.5"
              style={{ color: "var(--color-danger)" }}
            >
              Revert Reason
            </span>
            <span
              className="text-xs break-all"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
              }}
            >
              {result.revertReason}
            </span>
          </div>
        )}

        {result.decodedCall && (
          <div className="mt-2">
            <span
              className="text-xs block mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Function Call
            </span>
            <span
              className="text-xs px-2 py-1 rounded inline-block"
              style={{
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--color-accent-muted)",
                color: "var(--color-accent)",
              }}
            >
              {result.decodedCall.functionName}(
              {result.decodedCall.params.map((p) => p.type).join(", ")})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
