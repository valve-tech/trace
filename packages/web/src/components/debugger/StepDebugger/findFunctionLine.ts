import type { SourceFile } from "../../../api/source";

/**
 * Pure text-search for a function declaration across flattened Solidity files.
 * Returns the file/line of the first declaration found, or null. Used by the
 * step debugger when a click on a call-tree row needs to jump to a function
 * body whose source-map JUMPDEST the optimizer dropped (receive/fallback and
 * other unmapped entries).
 *
 * Match precedence inside a file:
 *   1. `function NAME(` inside a contract{} or library{}
 *   2. `function NAME(` inside an interface{}
 *   3. a `public NAME` declaration (auto-generated getter, e.g. `mapping
 *      public balanceOf`) inside a contract{}
 *
 * The implementation is intentionally regex+brace-depth rather than AST: the
 * input is flattened source (one verified contract, all imports inlined), so
 * a single ordered scan is both correct and orders of magnitude cheaper than
 * running a Solidity parser in the browser per click. Files iterate in order;
 * the first file with a match wins.
 *
 * `receive` and `fallback` are matched as special members (no `function`
 * keyword) — Solidity declares them as `receive() external payable` etc.
 */
export function findFunctionLine(
  files: readonly SourceFile[],
  funcName: string,
): { file: string; line: number } | null {
  const isSpecial = funcName === "receive" || funcName === "fallback";
  const funcPattern = isSpecial
    ? new RegExp(`\\b${funcName}\\s*\\(\\s*\\)`)
    : new RegExp(`function\\s+${escapeRegex(funcName)}\\s*\\(`);
  const varPattern = new RegExp(`\\b${escapeRegex(funcName)}\\b`);

  for (const file of files) {
    const lines = file.content.split("\n");

    let inInterface = false;
    let inContract = false;
    let braceDepth = 0;
    let interfaceMatch: number | null = null;
    let contractMatch: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      if (/\binterface\s+\w+/.test(line)) inInterface = true;
      if (/\bcontract\s+\w+/.test(line) || /\blibrary\s+\w+/.test(line)) {
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

      if (funcPattern.test(line)) {
        if (inContract && !inInterface) {
          contractMatch = i + 1;
        } else if (inInterface && interfaceMatch === null) {
          interfaceMatch = i + 1;
        } else if (contractMatch === null && interfaceMatch === null) {
          contractMatch = i + 1;
        }
      }

      // Public-state-variable shorthand for auto-generated getters.
      if (
        contractMatch === null &&
        varPattern.test(line) &&
        /\bpublic\b/.test(line) &&
        !/^\s*\/\//.test(line) &&
        inContract
      ) {
        contractMatch = i + 1;
      }
    }

    const bestMatch = contractMatch ?? interfaceMatch;
    if (bestMatch !== null) return { file: file.name, line: bestMatch };
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
