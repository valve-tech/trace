import type { OpcodeStep } from "../../types.js";
import type { StepDebuggerClassNames } from "./types.js";

export function DetailPanels({
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
        <Section
          title={`Stack (${step.stack.length} items)`}
          className={classNames.stack}
        >
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
        <Section
          title={`Memory (${step.memory.length} words)`}
          className={classNames.memory}
        >
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
      <span style={{ wordBreak: "break-all", color: "#c9d1d9" }}>
        {right}
      </span>
    </div>
  );
}
