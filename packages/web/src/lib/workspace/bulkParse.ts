import type { WorkspaceItemKind } from "./types";

/**
 * Parse a free-form blob (lines, comma-separated, comments, copy-pasted from a
 * sheet, …) into a flat list of Workspace items. Permissive but bounded: we
 * sweep the longest-prefix-first to avoid an address regex consuming the first
 * 40 hex chars of a tx hash. Block numbers (which have the highest false-
 * positive risk — any naked integer) only match when they're on their own
 * line, so prose like "block 21840192 had …" doesn't trigger.
 *
 * Output is deduped by (kind, value) — same address pasted twice → one item.
 */

export interface ParsedItem {
  kind: WorkspaceItemKind;
  value: string;
}

const TX_HEX = /0x[a-fA-F0-9]{64}\b/g;
const ADDR_HEX = /0x[a-fA-F0-9]{40}\b/g;
const NAKED_BLOCK = /^\s*(\d{1,12})\s*$/;

export function parseBulkPaste(blob: string): ParsedItem[] {
  const seen = new Set<string>(); // `${kind}:${normalized}`
  const out: ParsedItem[] = [];
  const add = (kind: WorkspaceItemKind, raw: string) => {
    const value = kind === "block" ? raw : raw.toLowerCase();
    const key = `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, value });
  };

  // Pass 1: tx hashes (64 hex chars). Blank them out so the address pass
  // doesn't extract the first 40 chars of every tx as a "different" address.
  let working = blob;
  for (const m of blob.matchAll(TX_HEX)) {
    add("tx", m[0]);
  }
  working = working.replace(TX_HEX, (match) => " ".repeat(match.length));

  // Pass 2: addresses (40 hex chars), now safely disjoint from tx hashes.
  for (const m of working.matchAll(ADDR_HEX)) {
    add("address", m[0]);
  }
  working = working.replace(ADDR_HEX, (match) => " ".repeat(match.length));

  // Pass 3: block numbers — ONLY when a line consists of just digits (with
  // optional whitespace). Anything else stays out to avoid false positives
  // from prose like "gas limit: 30000000" or "value: 1000".
  for (const line of working.split("\n")) {
    const m = NAKED_BLOCK.exec(line);
    if (m) add("block", m[1]!);
  }

  return out;
}
