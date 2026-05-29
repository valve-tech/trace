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
          <div className="px-3 py-4 text-xs text-center theme-text-muted">
            Loading storage…
          </div>
        ) : diffs.length === 0 ? (
          <div className="px-3 py-3 text-xs theme-text-muted">
            {highlightSlot ? (
              <span className="flex items-center gap-tight theme-mono">
                <span>{isStorageOp(currentOp) ? "reads slot" : "slot"}</span>
                <span className="theme-warning" title={formatWord(highlightSlot)}>
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
              <div key={i} className="text-xs theme-mono">
                <div className="flex items-center gap-tight">
                  <span className="theme-text-muted">slot:</span>
                  <span className="truncate theme-warning" title={formatWord(d.slot)}>
                    {truncateWord(d.slot)}
                  </span>
                </div>
                {d.oldValue !== null && (
                  <div className="flex items-center gap-tight pl-4">
                    <span className="theme-danger">-</span>
                    <span className="truncate theme-text-secondary" title={formatWord(d.oldValue)}>
                      {truncateWord(d.oldValue)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-tight pl-4">
                  <span className="theme-success">+</span>
                  <span className="truncate theme-accent" title={formatWord(d.newValue)}>
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
