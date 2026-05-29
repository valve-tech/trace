/**
 * Split back-button control for the global top bar: the arrow goes back
 * (browser history), the caret opens a dropdown of recently-viewed + pinned
 * entities. Because it lives in the always-rendered top bar, the recent
 * history persists across every page — drilling into a tx or block no longer
 * loses it. Backed by the shared recent-entities store.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useRecentEntities } from "../hooks/useRecentEntities";
import { togglePin, clearRecent, type RecentEntity } from "../lib/recentEntities";
import {
  dotColor,
  hrefFor,
  primaryLabel,
  secondaryLabel,
} from "../lib/recentEntityView";

export function BackHistoryControl({
  canGoBack,
  onBack,
}: {
  canGoBack: boolean;
  onBack: () => void;
}) {
  const entities = useRecentEntities();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const border = "1px 0 0 0 var(--color-border-muted)";
  const pinned = entities.filter((e) => e.pinned);
  const recent = entities.filter((e) => !e.pinned);

  return (
    <div ref={ref} className="relative flex items-stretch shrink-0">
      <button
        onClick={onBack}
        disabled={!canGoBack}
        title="Back"
        aria-label="Go back"
        className="flex items-center justify-center w-10 h-12 transition-opacity enabled:hover:opacity-80 disabled:opacity-30 disabled:cursor-default"
        style={{ color: "var(--color-text-secondary)", backgroundColor: "transparent", boxShadow: border }}
      >
        <Icon icon="heroicons:arrow-left" className="w-4 h-4" />
      </button>

      <button
        onClick={() => setOpen((o) => !o)}
        title="Recent & pinned history"
        aria-label="Recent and pinned history"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex items-center justify-center w-6 h-12 transition-opacity hover:opacity-100"
        style={{
          color: open ? "var(--color-accent)" : "var(--color-text-muted)",
          backgroundColor: "transparent",
          boxShadow: border,
        }}
      >
        <Icon icon="heroicons:chevron-down" className="w-3.5 h-3.5" />
        {pinned.length > 0 && (
          <span
            className="absolute top-2 right-1 w-1.5 h-1.5"
            style={{ backgroundColor: "var(--color-warning)" }}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="card absolute z-40 left-0 top-full mt-1"
          style={{ backgroundColor: "var(--color-bg-card)", width: 320 }}
        >
          <div className="bs-b-muted flex items-center justify-between px-3 py-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-widest theme-text-secondary"
            >
              Recent &amp; Pinned
            </span>
            {recent.length > 0 && (
              <button
                onClick={clearRecent}
                className="text-[10px] transition-opacity hover:opacity-100"
                style={{ color: "var(--color-text-muted)", backgroundColor: "transparent" }}
              >
                Clear recent
              </button>
            )}
          </div>

          {entities.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs theme-text-muted">
              Nothing viewed yet. Transactions, addresses and blocks you open
              show up here.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {pinned.length > 0 && <GroupLabel>★ Pinned</GroupLabel>}
              {pinned.map((e) => (
                <Row key={`${e.kind}:${e.value}`} entity={e} onNavigate={() => setOpen(false)} />
              ))}
              {recent.length > 0 && <GroupLabel>Recent</GroupLabel>}
              {recent.map((e) => (
                <Row key={`${e.kind}:${e.value}`} entity={e} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9px] uppercase tracking-widest px-3 pt-2 pb-1 theme-text-muted"
    >
      {children}
    </div>
  );
}

function Row({
  entity,
  onNavigate,
}: {
  entity: RecentEntity;
  onNavigate: () => void;
}) {
  const go = () => {
    window.location.hash = hrefFor(entity);
    onNavigate();
  };

  return (
    <div
      role="menuitem"
      className="group bs-b-muted flex items-center gap-inline px-3 py-2 cursor-pointer hover:opacity-90"
      onClick={go}
    >
      <span className="shrink-0 w-1.5 h-1.5" style={{ backgroundColor: dotColor(entity) }} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-mono truncate theme-accent">
          {primaryLabel(entity)}
        </div>
        <div className="text-[10px] mt-0.5 theme-text-muted">
          {secondaryLabel(entity)}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          togglePin(entity.kind, entity.value);
        }}
        title={entity.pinned ? "Unpin" : "Pin"}
        aria-label={entity.pinned ? "Unpin" : "Pin"}
        className={`shrink-0 transition-opacity ${
          entity.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        style={{
          color: entity.pinned ? "var(--color-warning)" : "var(--color-text-muted)",
          backgroundColor: "transparent",
        }}
      >
        <Icon
          icon={entity.pinned ? "heroicons:star-solid" : "heroicons:star"}
          className="w-3.5 h-3.5"
        />
      </button>
    </div>
  );
}
