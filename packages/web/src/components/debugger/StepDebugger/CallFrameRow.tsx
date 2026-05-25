import { useState } from "react";
import { Icon } from "@iconify/react";
import type { CallFrame } from "../../../api/debugger";
import type { SignatureMatch } from "../../../api/signatures";
import { lookupWellKnown } from "../../../lib/wellKnownSignatures";
import { CALL_TYPE_BORDER } from "./theme";
import type { InternalCall } from "./types";

// Short, uppercase call-type tag shown inline on each row (Tenderly-style),
// colored by the call kind. Keeps the tree scannable without a hover tooltip.
const CALL_TYPE_TAG: Record<string, string> = {
  CALL: "CALL",
  STATICCALL: "STATIC",
  DELEGATECALL: "DELEGATE",
  CALLCODE: "CALLCODE",
  CREATE: "CREATE",
  CREATE2: "CREATE2",
};

function formatGas(hex?: string): string | null {
  if (!hex) return null;
  try {
    const n = BigInt(hex);
    if (n === 0n) return null;
    return n.toLocaleString();
  } catch {
    return null;
  }
}

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
  const [expanded, setExpanded] = useState(depth < 2);
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
  // Flat rows (Tenderly-style): selection + hover + error drive the background;
  // call type is conveyed by the inline tag, not a chunky colored left border.
  const bgColor = isSelected
    ? "var(--color-accent-muted)"
    : frame.error
      ? "rgba(248, 81, 73, 0.06)"
      : hovered
        ? "var(--color-bg-secondary)"
        : "transparent";
  const typeColor = CALL_TYPE_BORDER[frame.type]?.replace(/0\.4\)/, "0.9)") ?? "var(--color-text-muted)";
  const typeTag = CALL_TYPE_TAG[frame.type];
  const gas = formatGas(frame.gasUsed);

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
        className="flex items-center gap-tight pr-2 py-1 cursor-pointer text-xs relative whitespace-nowrap"
        onClick={() => { onJumpTo(stepIndex, funcName !== "???" ? funcName : undefined); onSelect?.(frame); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          backgroundColor: bgColor,
          boxShadow: isSelected ? "inset 2px 0 0 0 var(--color-accent)" : undefined,
          fontFamily: "var(--font-mono)",
        }}
      >
        {/* Depth guide lines — one faint vertical rule per ancestor level. */}
        {Array.from({ length: depth }, (_, i) => (
          <span
            key={i}
            className="self-stretch flex-shrink-0"
            style={{ width: "14px", boxShadow: "inset 1px 0 0 0 var(--color-border-muted)", marginLeft: i === 0 ? "6px" : 0 }}
          />
        ))}

        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-4 flex items-center justify-center flex-shrink-0"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Icon icon={expanded ? "heroicons:chevron-down" : "heroicons:chevron-right"} className="w-3 h-3" />
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" style={{ marginLeft: depth === 0 ? "6px" : 0 }} />
        )}

        {typeTag && (
          <span
            className="flex-shrink-0 text-[9px] font-semibold tracking-wide px-1 py-0.5"
            style={{ color: typeColor, boxShadow: `inset 0 0 0 1px ${typeColor}` }}
            title={frame.type}
          >
            {typeTag}
          </span>
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

        {/* Gas used, right-aligned — the at-a-glance cost per call. */}
        {gas && (
          <span className="ml-auto flex-shrink-0 pl-3" style={{ color: "var(--color-text-muted)" }}>
            {gas}
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
          className="flex items-center gap-tight pr-2 py-1 cursor-pointer text-xs whitespace-nowrap"
          onClick={() => onJumpTo(ic.stepIndex, ic.funcName)}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {/* Guide lines indented one level deeper than the parent frame. */}
          {Array.from({ length: depth + 1 }, (_, g) => (
            <span
              key={g}
              className="self-stretch flex-shrink-0"
              style={{ width: "14px", boxShadow: "inset 1px 0 0 0 var(--color-border-muted)", marginLeft: g === 0 ? "6px" : 0 }}
            />
          ))}
          <span className="w-4 flex items-center justify-center flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
            <Icon icon="heroicons:arrow-turn-down-right" className="w-3 h-3" />
          </span>
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
