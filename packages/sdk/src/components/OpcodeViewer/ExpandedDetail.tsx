import type { OpcodeStep } from "../../types.js";
import { StackPanel } from "./StackPanel.js";
import { MemoryPanel } from "./MemoryPanel.js";
import { StoragePanel } from "./StoragePanel.js";

export function ExpandedDetail({
  step,
  className,
}: {
  step: OpcodeStep;
  className?: string;
}) {
  const hasStack = step.stack.length > 0;
  const hasMemory = step.memory.length > 0;
  const hasStorage = Object.keys(step.storage).length > 0;

  if (!hasStack && !hasMemory && !hasStorage) {
    return (
      <tr>
        <td
          colSpan={6}
          className={className}
          style={{
            padding: "8px 12px",
            fontSize: 11,
            backgroundColor: "rgba(0, 0, 0, 0.2)",
            color: "#6e7681",
          }}
        >
          No stack, memory, or storage data for this step.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td
        colSpan={6}
        className={className}
        style={{
          padding: 12,
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 11,
          }}
        >
          {hasStack && <StackPanel step={step} />}
          {hasMemory && <MemoryPanel step={step} />}
          {hasStorage && <StoragePanel step={step} />}
        </div>
      </td>
    </tr>
  );
}
