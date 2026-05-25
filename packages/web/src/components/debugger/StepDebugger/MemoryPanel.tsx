import { CollapsiblePanel } from "./CollapsiblePanel";
import { memoryToBytes, formatMemoryRow } from "./format";

/** Collapsible hex/ascii view of EVM memory, 16-byte rows. Caps at 1KB display. */
export function MemoryPanel({ memory, loading }: { memory: string[]; loading?: boolean }) {
  const memoryHex = memoryToBytes(memory);
  const memorySize = memoryHex.length / 2;
  const memoryRows = Math.min(Math.ceil(memorySize / 16), 64); // Cap at 1KB display

  return (
    <CollapsiblePanel title="Memory" count={memorySize} suffix="bytes" defaultOpen={false}>
      <div className="overflow-y-auto px-3 py-1" style={{ maxHeight: "200px" }}>
        {loading ? (
          <div className="py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>Loading memory…</div>
        ) : memorySize === 0 ? (
          <div className="py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>Memory is empty</div>
        ) : (
          <>
            {Array.from({ length: memoryRows }, (_, i) => {
              const offset = i * 16;
              const { hex, ascii } = formatMemoryRow(memoryHex, offset);
              return (
                <div key={i} className="flex items-center text-xs py-0.5" style={{ fontFamily: "var(--font-mono)" }}>
                  <span className="w-12 text-right mr-2 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                    {offset.toString(16).padStart(4, "0")}
                  </span>
                  <span className="flex-1 mr-3" style={{ color: "var(--color-text-primary)" }}>{hex}</span>
                  <span className="flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{ascii}</span>
                </div>
              );
            })}
            {memorySize > 1024 && (
              <div className="text-xs py-1 text-center" style={{ color: "var(--color-text-muted)" }}>
                Showing first 1KB of {memorySize.toLocaleString()} bytes
              </div>
            )}
          </>
        )}
      </div>
    </CollapsiblePanel>
  );
}
