import type { SourceFile } from "../../../api/source";

/**
 * Kinds of Solidity declarations we resolve for "go to definition" clicks.
 * Used as a label only — navigation behaviour is the same for all kinds.
 */
export type DefinitionKind =
  | "function"
  | "modifier"
  | "event"
  | "error"
  | "contract"
  | "library"
  | "interface"
  | "struct"
  | "enum"
  | "constructor"
  | "receive"
  | "fallback"
  | "state-var-getter";

export interface DefinitionHit {
  file: string;
  line: number;
  kind: DefinitionKind;
}

/**
 * Find the declaration of `name` across a contract's flattened sources.
 * Returns the first hit in file/line order, or null. Used by the source pane
 * for go-to-definition on identifier clicks — a broader cousin of
 * findFunctionLine, which stays focused on call-tree row jumps.
 *
 * Match precedence inside a single file (higher beats lower):
 *   1. function/modifier/event/error/struct/enum declarations inside a
 *      contract{} or library{}
 *   2. the same declarations inside an interface{}
 *   3. type declarations (contract/library/interface/abstract contract)
 *   4. constructor/receive/fallback by special name
 *   5. public state-variable getters (e.g. `mapping(...) public balanceOf`)
 *
 * Like findFunctionLine, this leans on flattened Solidity (all imports
 * inlined) so a single ordered scan is correct without an AST.
 */
export function findDefinitionLine(
  files: readonly SourceFile[],
  name: string,
): DefinitionHit | null {
  // Special-name members declared without an identifier (Solidity quirk).
  // Switch instead of a Record because `constructor` collides with the
  // Object.prototype property and TS reads it as `string`.
  const specialKind: DefinitionKind | null =
    name === "receive" ? "receive" :
    name === "fallback" ? "fallback" :
    name === "constructor" ? "constructor" : null;

  const esc = escapeRegex(name);
  // Order matters: earlier patterns beat later ones at the SAME line.
  const patterns: Array<{ kind: DefinitionKind; re: RegExp }> = [
    { kind: "function", re: new RegExp(`\\bfunction\\s+${esc}\\s*\\(`) },
    { kind: "modifier", re: new RegExp(`\\bmodifier\\s+${esc}\\b`) },
    { kind: "event", re: new RegExp(`\\bevent\\s+${esc}\\b`) },
    { kind: "error", re: new RegExp(`\\berror\\s+${esc}\\b`) },
    { kind: "struct", re: new RegExp(`\\bstruct\\s+${esc}\\b`) },
    { kind: "enum", re: new RegExp(`\\benum\\s+${esc}\\b`) },
    { kind: "contract", re: new RegExp(`\\b(?:abstract\\s+)?contract\\s+${esc}\\b`) },
    { kind: "library", re: new RegExp(`\\blibrary\\s+${esc}\\b`) },
    { kind: "interface", re: new RegExp(`\\binterface\\s+${esc}\\b`) },
  ];

  const specialPattern = specialKind
    ? new RegExp(`\\b${name}\\s*\\(\\s*\\)`)
    : null;

  // For public-state-var auto-getter fallback.
  const varRe = new RegExp(`\\b${esc}\\b`);

  for (const file of files) {
    const lines = file.content.split("\n");

    let inInterface = false;
    let inContract = false;
    let braceDepth = 0;

    // Per-file best matches by priority bucket.
    let inContractHit: DefinitionHit | null = null; // function/modifier/... inside contract
    let inInterfaceHit: DefinitionHit | null = null; // same kinds inside interface
    let typeDeclHit: DefinitionHit | null = null;    // contract/library/interface declaration
    let specialHit: DefinitionHit | null = null;     // receive/fallback/constructor
    let varGetterHit: DefinitionHit | null = null;   // public state var

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // Track scope for the in-contract-vs-interface precedence.
      if (/\binterface\s+\w+/.test(line)) inInterface = true;
      if (/\b(?:abstract\s+)?contract\s+\w+/.test(line) || /\blibrary\s+\w+/.test(line)) {
        inContract = true;
        inInterface = false;
      }

      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") {
          braceDepth--;
          if (braceDepth === 0) {
            inInterface = false;
            inContract = false;
          }
        }
      }

      // Try each declaration pattern in priority order. First match wins
      // for this line; higher buckets (in-contract) beat lower ones (interface).
      for (const { kind, re } of patterns) {
        if (!re.test(line)) continue;
        const isTypeDecl =
          kind === "contract" || kind === "library" || kind === "interface";
        const hit: DefinitionHit = { file: file.name, line: lineNum, kind };

        if (isTypeDecl) {
          if (typeDeclHit === null) typeDeclHit = hit;
        } else if (inContract && !inInterface) {
          if (inContractHit === null) inContractHit = hit;
        } else if (inInterface) {
          if (inInterfaceHit === null) inInterfaceHit = hit;
        } else if (inContractHit === null && inInterfaceHit === null) {
          inContractHit = hit;
        }
        break; // first pattern that matches this line wins
      }

      if (
        specialPattern &&
        specialHit === null &&
        specialKind &&
        specialPattern.test(line) &&
        // exclude declarations like `event Receive(...)` that happen to share the word
        !/\b(?:event|error|function|modifier)\s/.test(line)
      ) {
        specialHit = { file: file.name, line: lineNum, kind: specialKind };
      }

      if (
        varGetterHit === null &&
        inContract &&
        varRe.test(line) &&
        /\bpublic\b/.test(line) &&
        !/^\s*\/\//.test(line)
      ) {
        varGetterHit = { file: file.name, line: lineNum, kind: "state-var-getter" };
      }
    }

    const best =
      inContractHit ??
      inInterfaceHit ??
      typeDeclHit ??
      specialHit ??
      varGetterHit;
    if (best) return best;
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
