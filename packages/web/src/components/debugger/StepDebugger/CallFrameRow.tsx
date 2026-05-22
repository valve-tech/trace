import { useState } from "react";
import type { CallFrame } from "../../../api/debugger";
import type { SignatureMatch } from "../../../api/signatures";
import { lookupWellKnown } from "../../../lib/wellKnownSignatures";
import { CALL_TYPE_BG, CALL_TYPE_BORDER } from "./theme";
import type { InternalCall } from "./types";

/**
 * Render a single CallFrame from the API call tree.
 * Step index comes from the pre-computed frameStepMap (no mutable counters).
 */
export function CallFrameRow({
  frame,
  depth,
  onJumpTo,
  signatureMap,
  contractNames,
  frameStepMap,
  internalCallsByFrame,
  onSelect,
  selectedFrame,
}: {
  frame: CallFrame;
  depth: number;
  onJumpTo: (step: number, funcName?: string) => void;
  signatureMap: Record<string, SignatureMatch[]>;
  contractNames: Record<string, string | null>;
  frameStepMap: Map<CallFrame, number>;
  internalCallsByFrame: Map<CallFrame, InternalCall[]>;
  onSelect?: (frame: CallFrame) => void;
  selectedFrame?: CallFrame | null;
}) {
  const [expanded, setExpanded] = useState(depth < 4);
  const [hovered, setHovered] = useState(false);
  const hasChildren = (frame.calls?.length ?? 0) > 0;

  const selector = frame.input?.length >= 10 ? frame.input.slice(0, 10).toLowerCase() : "";

  const contractName = frame.to ? contractNames[frame.to.toLowerCase()] : null;
  const wellKnown = selector ? lookupWellKnown(selector) : undefined;
  const sigMatch = selector ? signatureMap[selector]?.[0]?.textSignature : undefined;
  const resolvedSig = wellKnown?.signature ?? sigMatch;
  const funcName = resolvedSig ? resolvedSig.split("(")[0]! : selector || "???";
  const displayLabel = contractName ?? wellKnown?.interface ?? null;

  const stepIndex = frameStepMap.get(frame) ?? 0;

  const isSelected = selectedFrame === frame;
  const bgColor = isSelected
    ? "var(--color-accent-muted)"
    : frame.error
      ? "rgba(248, 81, 73, 0.06)"
      : CALL_TYPE_BG[frame.type] ?? "transparent";
  const borderColor = isSelected
    ? "var(--color-accent)"
    : frame.error
      ? "rgba(248, 81, 73, 0.4)"
    : CALL_TYPE_BORDER[frame.type] ?? "transparent";

  // Parse value from hex wei to PLS
  const valuePLS = (() => {
    if (!frame.value || frame.value === "0x0" || frame.value === "0") return null;
    try {
      const wei = BigInt(frame.value);
      if (wei === 0n) return null;
      const whole = wei / 10n ** 18n;
      const frac = wei % 10n ** 18n;
      if (whole > 0n) return `${whole}.${frac.toString().padStart(18, "0").slice(0, 4)}`;
      // Small amounts: show more decimals
      const fracStr = frac.toString().padStart(18, "0");
      const firstNonZero = fracStr.search(/[^0]/);
      return `0.${fracStr.slice(0, Math.max(firstNonZero + 4, 4))}`;
    } catch {
      return null;
    }
  })();

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs relative whitespace-nowrap"
        onClick={() => { onJumpTo(stepIndex, funcName !== "???" ? funcName : undefined); onSelect?.(frame); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          paddingLeft: `${8 + depth * 14}px`,
          backgroundColor: bgColor,
          borderLeft: `3px solid ${borderColor}`,
          fontFamily: "var(--font-mono)",
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-4 text-center flex-shrink-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {displayLabel && (
          <>
            <span
              style={{ color: contractName ? "var(--color-accent)" : "var(--color-text-secondary)" }}
              title={frame.to ?? ""}
            >
              {displayLabel}
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>.</span>
          </>
        )}

        <span
          className="font-semibold"
          style={{ color: frame.error ? "var(--color-danger)" : "var(--color-text-primary)" }}
          title={frame.to ?? ""}
        >
          {funcName}
        </span>

        {frame.error && (
          <span
            className="flex-shrink-0 px-1"
            style={{ color: "var(--color-danger)", fontSize: "9px", fontWeight: 700 }}
            title={frame.error}
          >
            REVERT
          </span>
        )}

        {valuePLS && (
          <span className="flex-shrink-0" style={{ color: "var(--color-warning)" }}>
            {valuePLS} PLS
          </span>
        )}

        {hasChildren && (
          <span className="ml-auto flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
            ({frame.calls!.length})
          </span>
        )}

        {hovered && (
          <div
            className="absolute left-full ml-2 z-20 px-3 py-2 shadow-lg text-xs whitespace-nowrap"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              boxShadow: "0 0 0 1px var(--color-border-default)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <div style={{ color: "var(--color-danger)" }}>{frame.type}</div>
            {resolvedSig && <div>{resolvedSig}</div>}
            {frame.to && <div style={{ color: "var(--color-text-muted)" }}>{frame.to}</div>}
            <div style={{ color: "var(--color-text-muted)" }}>gas: {frame.gasUsed}</div>
            {frame.error && <div style={{ color: "var(--color-danger)" }}>error: {frame.error}</div>}
          </div>
        )}
      </div>

      {expanded && frame.calls?.map((child, i) => (
        <CallFrameRow
          key={i}
          frame={child}
          depth={depth + 1}
          onJumpTo={onJumpTo}
          signatureMap={signatureMap}
          contractNames={contractNames}
          frameStepMap={frameStepMap}
          internalCallsByFrame={internalCallsByFrame}
          onSelect={onSelect}
          selectedFrame={selectedFrame}
        />
      ))}
      {expanded && internalCallsByFrame.get(frame)?.map((ic, i) => (
        <div
          key={`internal-${i}`}
          className="flex items-center gap-1 px-2 py-1 cursor-pointer text-xs whitespace-nowrap"
          onClick={() => onJumpTo(ic.stepIndex, ic.funcName)}
          style={{
            paddingLeft: `${8 + (depth + 1) * 14}px`,
            backgroundColor: "rgba(148, 163, 184, 0.04)",
            borderLeft: "3px solid rgba(148, 163, 184, 0.2)",
            fontFamily: "var(--font-mono)",
            opacity: 0.6,
          }}
        >
          <span className="w-4 flex-shrink-0" />
          <span style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>
            {ic.funcName}
          </span>
          {ic.line > 0 && (
            <span style={{ color: "var(--color-text-muted)" }}>
              L{ic.line}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
