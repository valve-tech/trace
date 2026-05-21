import type { CallFrame } from "../../../api/debugger";
import type { SignatureMatch } from "../../../api/signatures";
import { lookupWellKnown } from "../../../lib/wellKnownSignatures";
import { OPCODE_COLORS } from "./theme";

/** Detail panel shown beneath the call tree when a frame is selected. */
export function FrameDetailPanel({
  frame,
  contractNames,
  signatureMap,
}: {
  frame: CallFrame;
  contractNames: Record<string, string | null>;
  signatureMap: Record<string, SignatureMatch[]>;
}) {
  const selector = frame.input?.length >= 10 ? frame.input.slice(0, 10).toLowerCase() : "";
  const contractName = frame.to ? contractNames[frame.to.toLowerCase()] : null;
  const wk = selector ? lookupWellKnown(selector) : undefined;
  const sigMatch = selector ? signatureMap[selector]?.[0]?.textSignature : undefined;
  const resolvedSig = wk?.signature ?? sigMatch;

  return (
    <div
      className="card-divider px-3 py-2 text-xs space-y-1 overflow-auto"
      style={{ backgroundColor: "var(--color-bg-secondary)", maxHeight: "120px" }}
    >
      <div className="flex gap-4">
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>type </span>
          <span style={{ color: OPCODE_COLORS[frame.type] ?? "var(--color-text-primary)" }}>{frame.type}</span>
        </div>
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>gas </span>
          <span style={{ fontFamily: "var(--font-mono)" }}>{parseInt(frame.gasUsed).toLocaleString()}</span>
        </div>
        {frame.value && frame.value !== "0x0" && frame.value !== "0" && (
          <div>
            <span style={{ color: "var(--color-text-muted)" }}>value </span>
            <span style={{ color: "var(--color-warning)", fontFamily: "var(--font-mono)" }}>{frame.value}</span>
          </div>
        )}
      </div>

      {frame.from && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>from </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{frame.from}</span>
        </div>
      )}

      {frame.to && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>to </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)" }}>
            {contractName ? `${contractName} ` : ""}{frame.to}
          </span>
        </div>
      )}

      {resolvedSig && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>sig </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>{resolvedSig}</span>
        </div>
      )}

      {frame.input && frame.input.length > 10 && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>input </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
            {frame.input}
          </span>
        </div>
      )}

      {frame.output && (
        <div>
          <span style={{ color: "var(--color-text-muted)" }}>output </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
            {frame.output}
          </span>
        </div>
      )}

      {frame.error && (
        <div>
          <span style={{ color: "var(--color-danger)" }}>error </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-danger)" }}>{frame.error}</span>
        </div>
      )}
    </div>
  );
}
