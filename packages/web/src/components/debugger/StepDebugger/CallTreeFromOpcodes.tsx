import { useMemo, useState } from "react";
import type { OpcodeStep, CallFrame } from "../../../api/debugger";
import type { SourceLocation } from "../../../api/source";
import type { SignatureMatch } from "../../../api/signatures";
import { PanelHeader } from "./PanelHeader";
import { CallFrameRow } from "./CallFrameRow";
import { FrameDetailPanel } from "./FrameDetailPanel";
import { buildScopesByFrame, type ScopeNode } from "./executionScopes";

/**
 * Sidebar tree built from the structured callTrace. Each external frame is
 * augmented with the internal Solidity function scopes it executed, traced via
 * the per-contract source maps (Remix's jump-i/jump-o model — see
 * executionScopes.ts). Rows map back to a step index via `frameStepMap`.
 */
export function CallTreeFromOpcodes({
  steps,
  onJumpTo,
  signatureMap,
  frameStepMap,
  traceSourceMaps,
  callTrace,
  contractNames,
  abiSelectors,
  onExpandFrame,
  inline,
}: {
  steps: OpcodeStep[];
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  frameStepMap: Map<CallFrame, number>;
  traceSourceMaps: Record<string, Record<number, SourceLocation | null>>;
  callTrace?: CallFrame | null;
  contractNames: Record<string, string | null>;
  abiSelectors: Record<string, Record<string, string>>;
  onExpandFrame?: (frame: CallFrame, entryStep: number, label: string) => void;
  inline?: boolean;
}) {
  // Nested internal-function scopes per frame, from each contract's source map.
  const scopesByFrame = useMemo((): Map<CallFrame, ScopeNode[]> => {
    if (!callTrace) return new Map();
    return buildScopesByFrame(callTrace, frameStepMap, steps, traceSourceMaps);
  }, [callTrace, frameStepMap, steps, traceSourceMaps]);

  const [selectedFrame, setSelectedFrame] = useState<CallFrame | null>(null);

  if (callTrace) {
    const content = (
      <CallFrameRow
        frame={callTrace}
        depth={0}
        onJumpTo={onJumpTo}
        signatureMap={signatureMap}
        contractNames={contractNames}
        abiSelectors={abiSelectors}
        frameStepMap={frameStepMap}
        scopesByFrame={scopesByFrame}
        onSelect={setSelectedFrame}
        selectedFrame={selectedFrame}
        onExpand={onExpandFrame}
      />
    );

    if (inline) return content;

    return (
      <div className="card overflow-hidden flex flex-col h-full">
        <PanelHeader title="Call Tree" count={callTrace.calls?.length ?? 0} suffix="calls" />
        <div className="overflow-auto flex-1">
          <div style={{ minWidth: "fit-content" }}>
            {content}
          </div>
        </div>
        {selectedFrame && (
          <FrameDetailPanel frame={selectedFrame} contractNames={contractNames} signatureMap={signatureMap} />
        )}
      </div>
    );
  }

  // Fallback: no call trace available
  if (inline) return <div className="text-xs p-2" style={{ color: "var(--color-text-muted)" }}>No call tree</div>;
  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <PanelHeader title="Call Tree" count={0} suffix="calls" />
      <div className="p-3 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>No call tree available</div>
    </div>
  );
}
