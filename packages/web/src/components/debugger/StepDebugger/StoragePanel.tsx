import { isStorageOp } from "@valve-tech/trace-sdk/hooks";
import { PanelHeader } from "./PanelHeader";
import { formatWord, truncateWord } from "./format";

export interface StorageDiff {
  slot: string;
  oldValue: string | null;
  newValue: string;
}

/** Shows storage slot writes that happened at the current step
 *  (curr.storage vs. prev.storage). Always visible below the active tab. */
export function StoragePanel({
  diffs,
  currentOp,
  loading,
  highlightSlot,
}: {
  diffs: StorageDiff[];
  currentOp: string;
  loading?: boolean;
  /** Slot the current SLOAD/SSTORE targets — shown even when there's no write. */
  highlightSlot?: string | null;
}) {
  return (
    <div className="card overflow-hidden">
      <PanelHeader title="Storage" count={diffs.length} suffix="changes" />
      <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
        {loading ? (
          <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
            Loading storage…
          </div>
        ) : diffs.length === 0 ? (
          <div className="px-3 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {highlightSlot ? (
              <span className="flex items-center gap-tight" style={{ fontFamily: "var(--font-mono)" }}>
                <span>{isStorageOp(currentOp) ? "reads slot" : "slot"}</span>
                <span title={formatWord(highlightSlot)} style={{ color: "var(--color-warning)" }}>
                  {truncateWord(highlightSlot)}
                </span>
                <span>(no change)</span>
              </span>
            ) : (
              <span className="block text-center">
                {isStorageOp(currentOp) ? "Storage read (no change)" : "No storage changes at this step"}
              </span>
            )}
          </div>
        ) : (
          <div className="px-3 py-1 space-y-2">
            {diffs.map((d, i) => (
              <div key={i} className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                <div className="flex items-center gap-tight">
                  <span style={{ color: "var(--color-text-muted)" }}>slot:</span>
                  <span className="truncate" title={formatWord(d.slot)} style={{ color: "var(--color-warning)" }}>
                    {truncateWord(d.slot)}
                  </span>
                </div>
                {d.oldValue !== null && (
                  <div className="flex items-center gap-tight pl-4">
                    <span style={{ color: "var(--color-danger)" }}>-</span>
                    <span className="truncate" title={formatWord(d.oldValue)} style={{ color: "var(--color-text-secondary)" }}>
                      {truncateWord(d.oldValue)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-tight pl-4">
                  <span style={{ color: "var(--color-success)" }}>+</span>
                  <span className="truncate" title={formatWord(d.newValue)} style={{ color: "var(--color-accent)" }}>
                    {truncateWord(d.newValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
