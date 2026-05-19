import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { OpcodeStep } from "../types.js";
import { useOpcodeNavigation } from "../hooks/useOpcodeNavigation.js";
import { getOpcodeColor, isExpensiveOp } from "./opcodeClassify.js";

export interface StepDebuggerClassNames {
  root?: string;
  header?: string;
  controls?: string;
  button?: string;
  panel?: string;
  stack?: string;
  memory?: string;
  storage?: string;
}

export interface StepDebuggerProps {
  /** The opcode trace, typically from `TraceResult.opcodes`. */
  steps: OpcodeStep[];
  /** Position to start at; clamped to `[0, steps.length-1]`. */
  initialIndex?: number;
  /** Fired whenever the current step changes (including on mount). */
  onStepChange?: (index: number, step: OpcodeStep) => void;
  /**
   * When true (default), the component listens for keyboard shortcuts while
   * focused. Arrow keys = forward/back, Home/End = ends, C/S/L = next
   * call/storage/log. Set false to disable.
   */
  keyboard?: boolean;
  /** Per-slot class names for theming. */
  classNames?: StepDebuggerClassNames;
  style?: CSSProperties;
  className?: string;
}

/**
 * Visual step-by-step opcode debugger. Owns its own navigation state via
 * `useOpcodeNavigation`. The component is data-agnostic — consumers who want
 * source-map highlighting, contract-name resolution, or stack decoding wrap
 * with their own enrichment hooks and pipe in via `onStepChange`.
 */
export function StepDebugger({
  steps,
  initialIndex,
  onStepChange,
  keyboard = true,
  classNames = {},
  style,
  className,
}: StepDebuggerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nav = useOpcodeNavigation(steps, { initialIndex });

  // Stable callback to forward step changes outward.
  const handleStepChange = useCallback(
    (index: number, step: OpcodeStep) => onStepChange?.(index, step),
    [onStepChange],
  );

  useEffect(() => {
    if (nav.step) handleStepChange(nav.currentIndex, nav.step);
  }, [nav.currentIndex, nav.step, handleStepChange]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!keyboard) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          nav.goForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          nav.goBack();
          break;
        case "Home":
          e.preventDefault();
          nav.jumpTo(0);
          break;
        case "End":
          e.preventDefault();
          nav.jumpTo(nav.totalSteps - 1);
          break;
        case "c":
        case "C":
          e.preventDefault();
          nav.nextCall();
          break;
        case "s":
        case "S":
          e.preventDefault();
          nav.nextStorage();
          break;
        case "l":
        case "L":
          e.preventDefault();
          nav.nextLog();
          break;
      }
    },
    [keyboard, nav],
  );

  const empty = nav.totalSteps === 0;

  return (
    <div
      ref={containerRef}
      className={[className, classNames.root].filter(Boolean).join(" ")}
      tabIndex={keyboard ? 0 : -1}
      onKeyDown={onKeyDown}
      style={{
        borderRadius: 8,
        border: "1px solid rgba(139, 148, 158, 0.2)",
        backgroundColor: "rgba(139, 148, 158, 0.03)",
        outline: "none",
        ...style,
      }}
    >
      <Header
        nav={nav}
        empty={empty}
        className={classNames.header}
      />
      <ControlRow
        nav={nav}
        empty={empty}
        className={classNames.controls}
        buttonClassName={classNames.button}
      />
      {!empty && nav.step && (
        <DetailPanels
          step={nav.step}
          classNames={classNames}
        />
      )}
      {empty && (
        <div
          style={{
            padding: 16,
            fontSize: 12,
            color: "#6e7681",
            textAlign: "center",
          }}
        >
          No opcode steps to debug.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal pieces
// ---------------------------------------------------------------------------

function Header({
  nav,
  empty,
  className,
}: {
  nav: ReturnType<typeof useOpcodeNavigation>;
  empty: boolean;
  className?: string;
}) {
  const step = nav.step;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        borderBottom: "1px solid rgba(139, 148, 158, 0.2)",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            margin: 0,
            color: "#c9d1d9",
          }}
        >
          Step Debugger
        </h3>
        <span style={{ fontSize: 11, color: "#8b949e" }}>
          {empty
            ? "0 / 0"
            : `${nav.currentIndex + 1} / ${nav.totalSteps}`}
        </span>
      </div>
      {step && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Badge label="PC" value={step.pc.toString()} />
          <Badge
            label="OP"
            value={step.op}
            valueColor={getOpcodeColor(step.op)}
            highlight={isExpensiveOp(step.op)}
          />
          <Badge label="Gas" value={step.gas.toLocaleString()} />
          <Badge label="Depth" value={step.depth.toString()} />
        </div>
      )}
    </div>
  );
}

function Badge({
  label,
  value,
  valueColor = "#c9d1d9",
  highlight = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  highlight?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontFamily: "monospace",
      }}
    >
      <span style={{ color: "#6e7681" }}>{label}</span>
      <span style={{ color: valueColor, fontWeight: 600 }}>{value}</span>
      {highlight && (
        <span
          title="Expensive operation"
          aria-label="Expensive operation"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "#ef4444",
          }}
        />
      )}
    </span>
  );
}

function ControlRow({
  nav,
  empty,
  className,
  buttonClassName,
}: {
  nav: ReturnType<typeof useOpcodeNavigation>;
  empty: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const disableAll = empty;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 16px",
        borderBottom: "1px solid rgba(139, 148, 158, 0.1)",
        flexWrap: "wrap",
      }}
    >
      <Button
        label="◀ Prev"
        title="Previous step (←)"
        onClick={nav.goBack}
        disabled={disableAll || !nav.canGoBack}
        className={buttonClassName}
      />
      <Button
        label="Next ▶"
        title="Next step (→)"
        onClick={nav.goForward}
        disabled={disableAll || !nav.canGoForward}
        className={buttonClassName}
      />
      <Button
        label="⇤ Start"
        title="Jump to start (Home)"
        onClick={() => nav.jumpTo(0)}
        disabled={disableAll || !nav.canGoBack}
        className={buttonClassName}
      />
      <Button
        label="End ⇥"
        title="Jump to end (End)"
        onClick={() => nav.jumpTo(nav.totalSteps - 1)}
        disabled={disableAll || !nav.canGoForward}
        className={buttonClassName}
      />
      <div style={{ flex: 1 }} />
      <Button
        label="Next CALL"
        title="Next CALL-family opcode (C)"
        onClick={nav.nextCall}
        disabled={disableAll}
        accent
        className={buttonClassName}
      />
      <Button
        label="Next SSTORE"
        title="Next storage-touching opcode (S)"
        onClick={nav.nextStorage}
        disabled={disableAll}
        accent
        className={buttonClassName}
      />
      <Button
        label="Next LOG"
        title="Next LOG opcode (L)"
        onClick={nav.nextLog}
        disabled={disableAll}
        accent
        className={buttonClassName}
      />
    </div>
  );
}

function Button({
  label,
  title,
  onClick,
  disabled,
  accent = false,
  className,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        padding: "5px 10px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        border: "1px solid rgba(139, 148, 158, 0.3)",
        backgroundColor: accent
          ? "rgba(99, 102, 241, 0.15)"
          : "rgba(0, 0, 0, 0.2)",
        color: accent ? "#6366f1" : "#c9d1d9",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

function DetailPanels({
  step,
  classNames,
}: {
  step: OpcodeStep;
  classNames: StepDebuggerClassNames;
}) {
  const hasStack = step.stack.length > 0;
  const hasMemory = step.memory.length > 0;
  const storageEntries = Object.entries(step.storage);
  const hasStorage = storageEntries.length > 0;

  if (!hasStack && !hasMemory && !hasStorage) {
    return (
      <div
        className={classNames.panel}
        style={{
          padding: 16,
          fontSize: 11,
          color: "#6e7681",
        }}
      >
        No stack, memory, or storage data for this step.
      </div>
    );
  }

  return (
    <div
      className={classNames.panel}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        fontSize: 11,
      }}
    >
      {hasStack && (
        <Section title={`Stack (${step.stack.length} items)`} className={classNames.stack}>
          {step.stack
            .slice()
            .reverse()
            .map((val, i) => (
              <Row
                key={i}
                left={(step.stack.length - 1 - i).toString()}
                right={val}
              />
            ))}
        </Section>
      )}
      {hasMemory && (
        <Section title={`Memory (${step.memory.length} words)`} className={classNames.memory}>
          {step.memory.slice(0, 16).map((word, i) => (
            <Row
              key={i}
              left={`0x${(i * 32).toString(16).padStart(4, "0")}`}
              right={word}
            />
          ))}
          {step.memory.length > 16 && (
            <div style={{ color: "#6e7681", padding: "2px 0" }}>
              ... {step.memory.length - 16} more words
            </div>
          )}
        </Section>
      )}
      {hasStorage && (
        <Section title="Storage" className={classNames.storage}>
          {storageEntries.map(([slot, value]) => (
            <Row
              key={slot}
              left={slot}
              leftColor="#eab308"
              right={value}
              separator="=>"
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span
        style={{
          fontWeight: 500,
          display: "block",
          marginBottom: 4,
          color: "#8b949e",
        }}
      >
        {title}
      </span>
      <div
        style={{
          padding: 8,
          borderRadius: 4,
          fontFamily: "monospace",
          maxHeight: 128,
          overflowY: "auto",
          backgroundColor: "rgba(139, 148, 158, 0.08)",
          fontSize: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({
  left,
  leftColor = "#6e7681",
  right,
  separator,
}: {
  left: string;
  leftColor?: string;
  right: string;
  separator?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span
        style={{
          minWidth: 40,
          flexShrink: 0,
          textAlign: "right",
          color: leftColor,
        }}
      >
        {left}
      </span>
      {separator && <span style={{ color: "#6e7681" }}>{separator}</span>}
      <span style={{ wordBreak: "break-all", color: "#c9d1d9" }}>{right}</span>
    </div>
  );
}
