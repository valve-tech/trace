import { useState } from "react";
import { Icon } from "@iconify/react";
import type { ScopeNode } from "./executionScopes";

/**
 * One internal-function scope in the call tree, rendered recursively so nested
 * calls (a function that calls another) nest visually. Clicking jumps the
 * debugger to where the function was entered.
 */
export function ScopeRow({
  scope,
  depth,
  onJumpTo,
}: {
  scope: ScopeNode;
  depth: number;
  onJumpTo: (step: number, funcName?: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = scope.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-tight pr-2 py-1 cursor-pointer text-xs whitespace-nowrap"
        onClick={() => onJumpTo(scope.startStep, scope.funcName)}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {Array.from({ length: depth }, (_, g) => (
          <span
            key={g}
            className="self-stretch flex-shrink-0"
            style={{ width: "14px", boxShadow: "inset 1px 0 0 0 var(--color-border-muted)", marginLeft: g === 0 ? "6px" : 0 }}
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
          <span className="w-4 flex items-center justify-center flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
            <Icon icon="heroicons:arrow-turn-down-right" className="w-3 h-3" />
          </span>
        )}

        <span style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>{scope.funcName}</span>
        {scope.line > 0 && (
          <span style={{ color: "var(--color-text-muted)" }}>L{scope.line}</span>
        )}
      </div>

      {expanded && scope.children.map((child, i) => (
        <ScopeRow key={i} scope={child} depth={depth + 1} onJumpTo={onJumpTo} />
      ))}
    </div>
  );
}
