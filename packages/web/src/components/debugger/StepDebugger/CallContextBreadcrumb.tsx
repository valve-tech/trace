import type { OpcodeStep } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";
import { getOpcodeColor } from "@valve-tech/trace-sdk";

/** Compact one-line summary above the main panes:
 *    Depth: 1 | PC: 42 | PUSH1 | Gas: 90,000 (-3) | Vault.sol:142 */
export function CallContextBreadcrumb({
  step,
  currentSourceLocation,
}: {
  step: OpcodeStep;
  currentSourceLocation: SourceLocation | null;
}) {
  return (
    <div
      className="px-4 py-2 card text-xs flex items-center gap-tight overflow-x-auto"
      style={{
        backgroundColor: "var(--color-bg-card)",
        boxShadow: "0 0 0 1px var(--color-border-default)",
        fontFamily: "var(--font-mono)",
        color: "var(--color-text-secondary)",
      }}
    >
      <span style={{ color: "var(--color-text-muted)" }}>Depth:</span>
      <span style={{ color: "var(--color-accent)" }}>{step.depth}</span>
      <span style={{ color: "var(--color-text-muted)" }}>|</span>
      <span style={{ color: "var(--color-text-muted)" }}>PC:</span>
      <span>{step.pc}</span>
      <span style={{ color: "var(--color-text-muted)" }}>|</span>
      <span style={{ color: getOpcodeColor(step.op), fontWeight: 600 }}>{step.op}</span>
      <span style={{ color: "var(--color-text-muted)" }}>|</span>
      <span style={{ color: "var(--color-text-muted)" }}>Gas:</span>
      <span>{step.gas.toLocaleString()}</span>
      <span style={{ color: "var(--color-warning)" }}>(-{step.gasCost})</span>
      {currentSourceLocation && (
        <>
          <span style={{ color: "var(--color-text-muted)" }}>|</span>
          <span style={{ color: "var(--color-success)" }}>
            {currentSourceLocation.file}:{currentSourceLocation.line}
          </span>
        </>
      )}
    </div>
  );
}
