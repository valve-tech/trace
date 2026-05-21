import type { ContractSource } from "../../../api/source";

export interface SourceFuncEntry {
  name: string;
  /** 0-based character offset of the `function` keyword across all concatenated
   *  source files. Used for proportional PC-to-function matching. */
  charOffset: number;
}

/**
 * Extract all named `function name(` declarations from all source files,
 * sorted by their character offset in the concatenated source.
 */
export function extractSourceFunctions(sourceData: ContractSource): SourceFuncEntry[] {
  const entries: SourceFuncEntry[] = [];
  let globalOffset = 0;
  for (const file of sourceData.files) {
    for (const m of file.content.matchAll(/\bfunction\s+(\w+)\s*\(/g)) {
      entries.push({ name: m[1]!, charOffset: globalOffset + (m.index ?? 0) });
    }
    globalOffset += file.content.length;
  }
  entries.sort((a, b) => a.charOffset - b.charOffset);
  return entries;
}

/**
 * Given a target PC (the JUMPDEST we land on) and the PC range of the trace,
 * return the function name whose source position most closely corresponds to
 * the target PC's proportional position in the bytecode range.
 *
 * This approximation works well when source order mirrors bytecode order
 * (the common case for Solidity without heavy inlining).
 */
export function resolveFuncNameByProportion(
  targetPc: number,
  minPc: number,
  maxPc: number,
  sourceFuncs: SourceFuncEntry[],
  totalSourceChars: number,
): string | null {
  if (sourceFuncs.length === 0 || maxPc <= minPc || totalSourceChars === 0) return null;
  const fraction = (targetPc - minPc) / (maxPc - minPc);
  const targetChar = Math.round(fraction * totalSourceChars);
  let best: SourceFuncEntry | null = null;
  let bestDist = Infinity;
  for (const fn of sourceFuncs) {
    const dist = Math.abs(fn.charOffset - targetChar);
    if (dist < bestDist) {
      bestDist = dist;
      best = fn;
    }
  }
  return best?.name ?? null;
}
