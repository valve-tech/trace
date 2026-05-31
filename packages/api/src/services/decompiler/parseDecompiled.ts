import { lookupKnownSlot, type KnownSlot } from "./knownSlots.js";

/**
 * Pure extractor for storage slot references in heimdall's decompiled
 * Solidity output. Heimdall doesn't emit a separate storage.json — it
 * renders storage accesses INLINE in the decompiled source as
 * `storage[<slot>]` reads / writes. This module scans the source for
 * those references, deduplicates, classifies each access as a read or
 * write based on context, and cross-references against the known-slot
 * registry for proxy-pattern labels.
 *
 * Pure / no dependencies on the heimdall CLI — testable against fixture
 * snippets of decompiled .sol output.
 */

export type SlotAccess = "read" | "write";

export interface DecompiledStorageSlot {
  /** 0x-prefixed 64-char hex slot value. */
  slot: string;
  /** "read" / "write" — which access kinds appeared. */
  access: SlotAccess[];
  /** Known proxy-pattern match, if any. */
  known: KnownSlot | null;
  /** Number of distinct storage[] references that landed on this slot. */
  hitCount: number;
}

/**
 * Match `storage[<HEX>]` references in heimdall's output. The slot
 * literal is captured. Hex casing varies in heimdall output; we
 * normalize on the way out.
 *
 *   storage[0xdead]                ← read (RHS of any expression)
 *   storage[0xdead] = ...          ← write (LHS of assignment)
 *   storage[keccak256(...)] = ...  ← mapping write (NOT a constant — skip)
 */
const STORAGE_REF_RE =
  /storage\[\s*(0x[0-9a-fA-F]{1,64})\s*\]/g;

/**
 * Classify a given match position as a write vs read. A write is when
 * the storage[...] expression appears on the LEFT-HAND side of an
 * assignment — i.e. the next non-whitespace, non-comment characters
 * after the closing `]` are `=` (NOT `==`). Everything else (RHS of an
 * expression, an argument, a comparison) is a read.
 */
function isWriteAtPosition(source: string, refEnd: number): boolean {
  // Skip whitespace
  let i = refEnd;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  if (source[i] !== "=") return false;
  // Distinguish `=` from `==` and `=>` (object-key style we'd never see
  // in Solidity, but defensive).
  return source[i + 1] !== "=" && source[i + 1] !== ">";
}

/**
 * Extract storage slot references from heimdall's decompiled .sol
 * source. Returns one entry per distinct constant slot, with combined
 * read/write annotations and any well-known label.
 *
 * Mapping accesses (`storage[keccak256(...)]`) are intentionally
 * skipped — they don't carry a constant slot literal, so we can't
 * surface them as a typed entry. They'd need to be reconstructed from
 * the trace, which is a separate feature.
 */
export function extractStorageSlots(
  decompiledSource: string,
): DecompiledStorageSlot[] {
  const found = new Map<string, DecompiledStorageSlot>();
  const re = new RegExp(STORAGE_REF_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(decompiledSource)) !== null) {
    const rawSlot = match[1]!;
    const refEnd = match.index + match[0].length;
    const access: SlotAccess = isWriteAtPosition(decompiledSource, refEnd)
      ? "write"
      : "read";

    // Normalize: 0x-prefixed, lowercase, zero-padded to 64 hex chars.
    const normalizedHex = rawSlot.slice(2).toLowerCase().padStart(64, "0");
    const slot = `0x${normalizedHex}`;

    const existing = found.get(slot);
    if (existing) {
      if (!existing.access.includes(access)) existing.access.push(access);
      existing.hitCount++;
    } else {
      found.set(slot, {
        slot,
        access: [access],
        known: lookupKnownSlot(rawSlot),
        hitCount: 1,
      });
    }
  }

  // Sort: known slots first (alphabetically by label), then unknowns by
  // hex order. Gives the panel a stable, useful default ordering.
  return [...found.values()].sort((a, b) => {
    if (a.known && !b.known) return -1;
    if (!a.known && b.known) return 1;
    if (a.known && b.known) return a.known.label.localeCompare(b.known.label);
    return a.slot.localeCompare(b.slot);
  });
}
