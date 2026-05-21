import { CollapsiblePanel } from "./CollapsiblePanel";
import { formatWord, truncateWord } from "./format";

/** Collapsible panel showing the EVM stack at the current step.
 *  Words that changed since the previous step (indices in `changedIndices`)
 *  are highlighted with the accent color. */
export function StackPanel({
  stack,
  changedIndices,
}: {
  stack: string[];
  changedIndices: Set<number>;
}) {
  return (
    <CollapsiblePanel title="Stack" count={stack.length} defaultOpen={false}>
      <div className="overflow-y-auto px-3 py-1" style={{ maxHeight: "200px" }}>
        {stack.length === 0 ? (
          <div className="py-4 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>Stack is empty</div>
        ) : (
          [...stack].reverse().map((word, i) => {
            const actualIndex = stack.length - 1 - i;
            const changed = changedIndices.has(actualIndex);
            return (
              <div key={i} className="flex items-center text-xs py-0.5" style={{ fontFamily: "var(--font-mono)" }}>
                <span className="w-8 text-right mr-2 flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{i}</span>
                <span
                  className="truncate"
                  title={formatWord(word)}
                  style={{ color: changed ? "var(--color-accent)" : "var(--color-text-primary)", fontWeight: changed ? 600 : 400 }}
                >
                  {truncateWord(word)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </CollapsiblePanel>
  );
}
