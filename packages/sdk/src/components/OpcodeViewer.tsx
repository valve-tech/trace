import {
  Fragment,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type { OpcodeStep } from "../types.js";
import { Th } from "./OpcodeViewer/cells.js";
import { OpcodeLegend } from "./OpcodeViewer/OpcodeLegend.js";
import { ExpandedDetail } from "./OpcodeViewer/ExpandedDetail.js";
import { Header } from "./OpcodeViewer/Header.js";
import { OpcodeRow } from "./OpcodeViewer/OpcodeRow.js";
import { LoadMoreButton } from "./OpcodeViewer/LoadMoreButton.js";

export interface OpcodeViewerClassNames {
  root?: string;
  header?: string;
  legend?: string;
  table?: string;
  row?: string;
  detail?: string;
  loadMore?: string;
  filterInput?: string;
}

export interface OpcodeViewerProps {
  /** The opcode trace, typically from `TraceResult.opcodes`. */
  steps: OpcodeStep[];
  /** Optional click handler — fires with the step index and step. */
  onSelectStep?: (index: number, step: OpcodeStep) => void;
  /** Page size for incremental "Load more". Default 500. */
  rowsPerPage?: number;
  /** Hide the header (title + step count + filter input). */
  hideHeader?: boolean;
  /** Hide the legend strip. */
  hideLegend?: boolean;
  /** Per-slot class names for theming. */
  classNames?: OpcodeViewerClassNames;
  /** Inline style on the root element. */
  style?: CSSProperties;
  /** className on the root. */
  className?: string;
}

const DEFAULT_ROWS_PER_PAGE = 500;

/**
 * Tabular opcode-trace viewer with filter, expandable per-row stack/memory/
 * storage detail, and incremental pagination for large traces.
 *
 * The component is fully controlled by its `steps` prop — no fetching, no
 * external state. Headless theming via `classNames` + `style` + `className`.
 */
export function OpcodeViewer({
  steps,
  onSelectStep,
  rowsPerPage = DEFAULT_ROWS_PER_PAGE,
  hideHeader = false,
  hideLegend = false,
  classNames = {},
  style,
  className,
}: OpcodeViewerProps): React.JSX.Element {
  const [displayCount, setDisplayCount] = useState(rowsPerPage);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [filterOp, setFilterOp] = useState("");

  const indexedSteps = useMemo(
    () => steps.map((step, index) => ({ step, index })),
    [steps],
  );

  const filteredSteps = useMemo(() => {
    if (!filterOp) return indexedSteps;
    const needle = filterOp.toLowerCase();
    return indexedSteps.filter((e) =>
      e.step.op.toLowerCase().includes(needle),
    );
  }, [indexedSteps, filterOp]);

  const visibleSteps = filteredSteps.slice(0, displayCount);
  const hasMore = displayCount < filteredSteps.length;

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilterOp(value);
      setDisplayCount(rowsPerPage);
    },
    [rowsPerPage],
  );

  const handleRowClick = useCallback(
    (globalIndex: number, step: OpcodeStep) => {
      setExpandedRow((prev) => (prev === globalIndex ? null : globalIndex));
      onSelectStep?.(globalIndex, step);
    },
    [onSelectStep],
  );

  return (
    <div
      className={[className, classNames.root].filter(Boolean).join(" ")}
      style={{
        borderRadius: 8,
        border: "1px solid rgba(139, 148, 158, 0.2)",
        backgroundColor: "rgba(139, 148, 158, 0.03)",
        ...style,
      }}
    >
      {!hideHeader && (
        <Header
          totalSteps={steps.length}
          filteredCount={filteredSteps.length}
          filterOp={filterOp}
          onFilterChange={handleFilterChange}
          className={classNames.header}
          inputClassName={classNames.filterInput}
        />
      )}

      {!hideLegend && <OpcodeLegend className={classNames.legend} />}

      <div
        className={classNames.table}
        style={{
          overflowX: "auto",
          maxHeight: 600,
          overflowY: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            fontSize: 11,
            borderCollapse: "collapse",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              backgroundColor: "rgba(0, 0, 0, 0.2)",
            }}
          >
            <tr
              style={{ borderBottom: "1px solid rgba(139, 148, 158, 0.2)" }}
            >
              <Th width={64} align="left">Step</Th>
              <Th width={64} align="left">PC</Th>
              <Th width={128} align="left">Opcode</Th>
              <Th width={96} align="right">Gas</Th>
              <Th width={96} align="right">Gas Cost</Th>
              <Th width={64} align="right">Depth</Th>
            </tr>
          </thead>
          <tbody>
            {visibleSteps.map(({ step, index }) => (
              <Fragment key={index}>
                <OpcodeRow
                  step={step}
                  index={index}
                  isExpanded={expandedRow === index}
                  rowClassName={classNames.row}
                  onClick={() => handleRowClick(index, step)}
                />
                {expandedRow === index && (
                  <ExpandedDetail
                    step={step}
                    className={classNames.detail}
                  />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <LoadMoreButton
          rowsPerPage={rowsPerPage}
          remaining={filteredSteps.length - displayCount}
          onClick={() => setDisplayCount((p) => p + rowsPerPage)}
          className={classNames.loadMore}
        />
      )}
    </div>
  );
}

export {
  classifyOpcode,
  getOpcodeColor,
  isExpensiveOp,
  OPCODE_CATEGORY_COLORS,
  type OpcodeCategory,
} from "./opcodeClassify.js";
