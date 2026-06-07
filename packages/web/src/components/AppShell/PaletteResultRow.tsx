import { Icon } from "@iconify/react";
import { AddToWorkspaceButton } from "../workspace/AddToWorkspaceButton";
import {
  PALETTE_ENTITY_MIME,
  type PaletteEntityPayload,
} from "../workspace/PaletteWorkspaceDropZone";
import type { Result } from "./buildResults";

/** A single command-palette result row: icon · tag · label/detail, an
 *  optional add-to-workspace button, and the ↵ hint when selected. Draggable
 *  when the result carries a fileable entity. */
export function PaletteResultRow({
  result,
  selected,
  onHover,
  onActivate,
  onDragStart,
  onDragEnd,
}: {
  result: Result;
  selected: boolean;
  onHover: () => void;
  onActivate: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const r = result;
  return (
    <div
      draggable={!!r.entity}
      onDragStart={(e) => {
        if (!r.entity) return;
        const payload: PaletteEntityPayload = r.entity;
        e.dataTransfer.setData(PALETTE_ENTITY_MIME, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "copy";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-row px-4 py-2.5 transition-colors ${selected ? "theme-accent-bg bs-l-accent-in" : "bg-transparent"} ${r.entity ? "cursor-grab" : ""}`}
    >
      <button
        onClick={onActivate}
        className="flex items-center gap-row flex-1 min-w-0 text-left bg-transparent"
      >
        <Icon
          icon={r.icon}
          className={`w-4 h-4 shrink-0 ${selected ? "theme-accent" : "theme-text-secondary"}`}
        />
        <span
          className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 shrink-0 theme-tertiary-bg theme-text-secondary"
        >
          {r.tag}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-mono truncate leading-snug theme-text"
          >
            {r.label}
          </div>
          <div
            className="text-[11px] truncate theme-text-muted"
          >
            {r.detail}
          </div>
        </div>
      </button>
      {r.entity && (
        <div onClick={(e) => e.stopPropagation()}>
          <AddToWorkspaceButton
            kind={r.entity.kind}
            value={r.entity.value}
            compact
          />
        </div>
      )}
      {selected && (
        <kbd
          className="text-[10px] px-2 py-1 font-mono shrink-0 theme-card-bg theme-text-secondary"
        >
          ↵
        </kbd>
      )}
    </div>
  );
}
