/**
 * Presentation helpers for recent/pinned entities, shared by the global
 * back-button history dropdown (RecentMenu) and the Landing rail (RecentRail)
 * so both render rows identically.
 */

import type { RecentEntity } from "./recentEntities";

/** Kind dot colour — tx by status, addresses green, contracts purple. */
export function dotColor(e: RecentEntity): string {
  if (e.kind === "tx") {
    if (e.status === "success") return "var(--color-success)";
    if (e.status === "reverted") return "var(--color-danger)";
    return "var(--color-text-muted)";
  }
  if (e.kind === "address") return "var(--color-success)";
  if (e.kind === "contract") return "var(--color-accent)";
  return "var(--color-text-muted)"; // block
}

/** Hash-router target for an entity. */
export function hrefFor(e: RecentEntity): string {
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

function truncMid(v: string): string {
  if (!v.startsWith("0x") || v.length <= 16) return v;
  return `${v.slice(0, 8)}…${v.slice(-6)}`;
}

export function primaryLabel(e: RecentEntity): string {
  if (e.label) return e.label;
  return e.value.startsWith("0x") ? truncMid(e.value) : `#${e.value}`;
}

export function secondaryLabel(e: RecentEntity): string {
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
