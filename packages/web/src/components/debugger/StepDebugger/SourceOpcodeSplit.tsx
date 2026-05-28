import type { ContractSource, SlitherFinding } from "../../../api/source";
import type { OpcodeStep } from "../../../api/debugger";
import type { HighlightSpan } from "../SoliditySourceViewer";
import type { OpcodeFrequency } from "./opcodeStats";
import { SourceTabContent } from "./SourceTabContent";
import { OpcodeFrequencyTags } from "./OpcodeFrequencyTags";
import { OpcodeTracePane } from "./OpcodeTracePane";

type ContractSourceFile = ContractSource["files"][number];

/**
 * The synchronized debugger view: verified source on the left, the opcode
 * trace on the right, both tracking the current step. Stepping highlights the
 * exact source sub-expression AND the matching opcode row; clicking an opcode
 * row jumps both panes; clicking an executable source line jumps to the first
 * opcode mapped there. This is the bidirectional link between bytecode and the
 * Solidity that produced it.
 */
export function SourceOpcodeSplit({
  // source pane
  currentSourceFile,
  effectiveLine,
  highlightSpan,
  scrollKey,
  slitherFindings,
  sourceLoading,
  activeContractAddress,
  executableLines,
  onJumpToLine,
  // opcode pane
  steps,
  currentStep,
  goTo,
  filteredIndices,
  maxDepth,
  opcodeFreqs,
  opcodeFilter,
  onToggleOpcode,
}: {
  currentSourceFile: ContractSourceFile | null;
  effectiveLine: number | null;
  highlightSpan: HighlightSpan | null;
  scrollKey: number;
  slitherFindings: SlitherFinding[];
  sourceLoading: boolean;
  activeContractAddress: string | null;
  executableLines: Set<number>;
  onJumpToLine: (line: number) => void;
  steps: OpcodeStep[];
  currentStep: number;
  goTo: (step: number) => void;
  filteredIndices: number[] | null;
  maxDepth: number;
  opcodeFreqs: OpcodeFrequency[];
  opcodeFilter: string;
  onToggleOpcode: (op: string) => void;
}) {
  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-260px)] min-h-[480px]">
      {/* Source — the larger pane */}
      <div className="lg:flex-[3] min-w-0 min-h-[240px] flex-1">
        <SourceTabContent
          currentSourceFile={currentSourceFile}
          effectiveLine={effectiveLine}
          highlightSpan={highlightSpan}
          scrollKey={scrollKey}
          slitherFindings={slitherFindings}
          sourceLoading={sourceLoading}
          activeContractAddress={activeContractAddress}
          maxHeight="100%"
          onLineClick={onJumpToLine}
          executableLines={executableLines}
        />
      </div>

      {/* Opcode trace — synced companion. The `.card` class already provides
          the bg-card surface + outset border + 1px margin; no need to repeat
          them inline. */}
      <div className="lg:flex-[2] lg:min-w-[340px] min-h-[240px] flex flex-col card overflow-hidden">
        <OpcodeFrequencyTags
          frequencies={opcodeFreqs}
          activeOp={opcodeFilter}
          onToggle={onToggleOpcode}
        />
        <div className="flex-1 min-h-0">
          <OpcodeTracePane
            steps={steps}
            currentStep={currentStep}
            goTo={goTo}
            filteredIndices={filteredIndices}
            maxDepth={maxDepth}
          />
        </div>
      </div>
    </div>
  );
}
