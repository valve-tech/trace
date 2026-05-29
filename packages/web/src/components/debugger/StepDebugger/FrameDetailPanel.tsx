import type { CallFrame } from "../../../api/debugger";
import type { SignatureMatch } from "../../../api/signatures";
import { lookupWellKnown } from "../../../lib/wellKnownSignatures";

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
      className="card-divider px-3 py-2 text-xs space-y-1 overflow-auto theme-secondary-bg"
      style={{ maxHeight: "120px" }}
    >
      <div className="flex gap-row">
        <div>
          <span className="theme-text-muted">type </span>
          <span className="theme-danger">{frame.type}</span>
        </div>
        <div>
          <span className="theme-text-muted">gas </span>
          <span className="theme-mono">{parseInt(frame.gasUsed).toLocaleString()}</span>
        </div>
        {frame.value && frame.value !== "0x0" && frame.value !== "0" && (
          <div>
            <span className="theme-text-muted">value </span>
            <span className="theme-warning theme-mono">{frame.value}</span>
          </div>
        )}
      </div>

      {frame.from && (
        <div>
          <span className="theme-text-muted">from </span>
          <span className="theme-mono theme-text">{frame.from}</span>
        </div>
      )}

      {frame.to && (
        <div>
          <span className="theme-text-muted">to </span>
          <span className="theme-mono theme-accent">
            {contractName ? `${contractName} ` : ""}{frame.to}
          </span>
        </div>
      )}

      {resolvedSig && (
        <div>
          <span className="theme-text-muted">sig </span>
          <span className="theme-mono theme-text">{resolvedSig}</span>
        </div>
      )}

      {frame.input && frame.input.length > 10 && (
        <div>
          <span className="theme-text-muted">input </span>
          <span className="theme-mono theme-text-secondary" style={{ wordBreak: "break-all" }}>
            {frame.input}
          </span>
        </div>
      )}

      {frame.output && (
        <div>
          <span className="theme-text-muted">output </span>
          <span className="theme-mono theme-text-secondary" style={{ wordBreak: "break-all" }}>
            {frame.output}
          </span>
        </div>
      )}

      {frame.error && (
        <div>
          <span className="theme-danger">error </span>
          <span className="theme-mono theme-danger">{frame.error}</span>
        </div>
      )}
    </div>
  );
}
