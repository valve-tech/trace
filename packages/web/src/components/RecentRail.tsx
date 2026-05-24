/**
 * Recent & Pinned entity rail. Reads the shared recent-entities store and lets
 * the user jump back to anything they've looked at, or pin the ones they keep
 * returning to. Navigates via the hash router so it works from the app shell,
 * outside any single feature's navigation context.
 */

import { Icon } from "@iconify/react";
import { useRecentEntities } from "../hooks/useRecentEntities";
import { togglePin, type EntityKind, type RecentEntity } from "../lib/recentEntities";
import { truncateAddr } from "./explorer/format";
import { EmptyState } from "./primitives/EmptyState";

const KIND_COLOR: Record<EntityKind, string> = {
  address: "var(--color-success)",
  contract: "var(--color-accent)",
  tx: "var(--color-text-muted)",
  block: "var(--color-text-muted)",
};

function dotColor(e: RecentEntity): string {
  if (e.kind === "tx") {
    if (e.status === "success") return "var(--color-success)";
    if (e.status === "reverted") return "var(--color-danger)";
    return "var(--color-text-muted)";
  }
  return KIND_COLOR[e.kind];
}

function hrefFor(e: RecentEntity): string {
  switch (e.kind) {
    case "tx":
      return `/explorer?tx=${e.value}`;
    case "block":
      return `/explorer?block=${e.value}`;
    case "address":
    case "contract":
      return `/explorer?address=${e.value}`;
  }
}

function primaryLabel(e: RecentEntity): string {
  if (e.label) return e.label;
  return e.value.startsWith("0x") ? truncateAddr(e.value) : `#${e.value}`;
}

function secondaryLabel(e: RecentEntity): string {
  const parts: string[] = [e.kind];
  if (e.kind === "tx" && e.status) parts.push(e.status);
  if (e.visits > 1) parts.push(`${e.visits} visits`);
  else parts.push(ago(e.lastSeen));
  return parts.join(" · ");
}

function ago(ms: number): string {
  const d = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function RecentRail() {
  const entities = useRecentEntities();
  const pinned = entities.filter((e) => e.pinned);
  const recent = entities.filter((e) => !e.pinned);

  return (
    <div className="card w-full">
      <div className="bs-b-muted flex items-center justify-between px-3 py-2">
        <h3
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Recent &amp; Pinned
        </h3>
        {entities.length > 0 && (
          <span
            className="text-[11px] font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {entities.length}
          </span>
        )}
      </div>

      {entities.length === 0 ? (
        <EmptyState
          icon="heroicons:clock"
          title="Nothing viewed yet"
          subtitle="Transactions, addresses and blocks you open will show up here."
        />
      ) : (
        <div>
          {pinned.length > 0 && <GroupLabel>★ Pinned</GroupLabel>}
          {pinned.map((e) => (
            <Row key={`${e.kind}:${e.value}`} entity={e} />
          ))}
          {recent.length > 0 && <GroupLabel>Recent</GroupLabel>}
          {recent.map((e) => (
            <Row key={`${e.kind}:${e.value}`} entity={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9px] uppercase tracking-widest px-3 pt-2 pb-1"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </div>
  );
}

function Row({ entity }: { entity: RecentEntity }) {
  const go = () => {
    window.location.hash = hrefFor(entity);
  };

  return (
    <div
      className="group bs-b-muted flex items-center gap-inline px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity"
      onClick={go}
      style={{ backgroundColor: "transparent" }}
    >
      <span
        className="shrink-0 w-1.5 h-1.5"
        style={{ backgroundColor: dotColor(entity) }}
      />
      <div className="min-w-0 flex-1">
        <div
          className="text-xs font-mono truncate"
          style={{ color: "var(--color-accent)" }}
        >
          {primaryLabel(entity)}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
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
          color: entity.pinned
            ? "var(--color-warning)"
            : "var(--color-text-muted)",
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
