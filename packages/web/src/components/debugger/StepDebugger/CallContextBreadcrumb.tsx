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
    <div className="px-4 py-2 card text-xs flex items-center gap-tight overflow-x-auto theme-mono theme-text-secondary">
      <span className="theme-text-muted">Depth:</span>
      <span className="theme-accent">{step.depth}</span>
      <span className="theme-text-muted">|</span>
      <span className="theme-text-muted">PC:</span>
      <span>{step.pc}</span>
      <span className="theme-text-muted">|</span>
      <span className="font-semibold" style={{ color: getOpcodeColor(step.op) }}>{step.op}</span>
      <span className="theme-text-muted">|</span>
      <span className="theme-text-muted">Gas:</span>
      <span>{step.gas.toLocaleString()}</span>
      <span className="theme-warning">(-{step.gasCost})</span>
      {currentSourceLocation && (
        <>
          <span className="theme-text-muted">|</span>
          <span className="theme-success">
            {currentSourceLocation.file}:{currentSourceLocation.line}
          </span>
        </>
      )}
    </div>
  );
}
