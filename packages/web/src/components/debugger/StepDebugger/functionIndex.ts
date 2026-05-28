import type { SourceFile } from "../../../api/source";

/**
 * Lightweight, AST-free symbol lookup over a contract's (flattened) source.
 *
 * Flattened verified sources place every contract/library/interface at the top
 * level, in order — they never nest — and Solidity functions don't nest either.
 * So the block enclosing a line is simply the most recent `contract|library|
 * interface` declared at or before it, and the enclosing callable is the most
 * recent function/modifier/constructor/receive/fallback before it. An ordered
 * scan is enough; no brace matching, which strings and modifiers would foil.
 *
 * This recovers the real name for functions whose entry JUMPDEST maps to an
 * inner expression (optimized SafeMath: the `mul` body maps to `c / a`, not the
 * header) and tells library calls apart from a contract's own internals.
 */

export interface FnInfo {
  name: string;
  isLibrary: boolean;
}

interface Decl {
  line: number;
  name: string;
}
interface Block {
  line: number;
  library: boolean;
}

export interface FileIndex {
  fns: Decl[];
  blocks: Block[];
}

/** Index one file: ordered lists of callable and block declarations. */
function indexFile(content: string): FileIndex {
  const lines = content.split("\n");
  const fns: Decl[] = [];
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const ln = i + 1;
    const block = line.match(/\b(contract|library|interface)\s+\w+/);
    if (block) blocks.push({ line: ln, library: block[1] === "library" });

    let m: RegExpMatchArray | null;
    if ((m = line.match(/\bfunction\s+(\w+)/))) fns.push({ line: ln, name: m[1]! });
    else if ((m = line.match(/\bmodifier\s+(\w+)/))) fns.push({ line: ln, name: m[1]! });
    else if (/^\s*constructor\b/.test(line)) fns.push({ line: ln, name: "constructor" });
    else if (/^\s*receive\s*\(/.test(line)) fns.push({ line: ln, name: "receive" });
    else if (/^\s*fallback\s*\(/.test(line)) fns.push({ line: ln, name: "fallback" });
  }
  return { fns, blocks };
}

/** Build a per-file index for one contract's source files, keyed by file name. */
export function buildFunctionIndex(files: SourceFile[]): Map<string, FileIndex> {
  const map = new Map<string, FileIndex>();
  for (const f of files) map.set(f.name, indexFile(f.content));
  return map;
}

/** The last declaration at or before `line` (lists are in ascending order). */
function enclosing<T extends { line: number }>(arr: T[], line: number): T | undefined {
  let best: T | undefined;
  for (const d of arr) {
    if (d.line <= line) best = d;
    else break;
  }
  return best;
}

/**
 * The function containing (file, line) and whether it lives in a `library`.
 * Returns null when we have no index for the file or no function encloses the
 * line, so callers can fall back to their snippet-based heuristic.
 */
export function classifyFn(
  index: Map<string, FileIndex> | undefined,
  file: string | undefined,
  line: number | undefined,
): FnInfo | null {
  if (!index || !file || line == null) return null;
  const fi = index.get(file);
  if (!fi) return null;
  const fn = enclosing(fi.fns, line);
  if (!fn) return null;
  return { name: fn.name, isLibrary: enclosing(fi.blocks, line)?.library ?? false };
}
