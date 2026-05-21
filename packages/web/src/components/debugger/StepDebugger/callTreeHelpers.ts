import type { CallFrame, OpcodeStep } from "../../../api/debugger";
import type { SignatureMatch } from "../../../api/signatures";

export interface FlatCallInfo {
  selector: string;
  to: string;
  type: string;
  value?: string;
  input: string; // full calldata — used to disambiguate selector collisions
}

/** Best-effort extraction of the 4-byte selector from a CALL-family opcode
 *  by reading the args memory region pointed to by the stack. */
export function extractSelector(s: OpcodeStep): string | undefined {
  try {
    const stackLen = s.stack.length;
    const argsOffsetIdx = s.op === "CALL" || s.op === "CALLCODE" ? stackLen - 4 : stackLen - 3;
    if (argsOffsetIdx >= 0 && s.memory.length > 0) {
      const argsOffset = Number(BigInt(s.stack[argsOffsetIdx] ?? "0"));
      const memHex = s.memory.join("");
      const selectorHex = memHex.slice(argsOffset * 2, argsOffset * 2 + 8);
      if (selectorHex.length === 8) return "0x" + selectorHex;
    }
  } catch {
    // best-effort
  }
  return undefined;
}

/** Recursively visit every frame in the call tree, root first, pre-order. */
export function walkCallTree(frame: CallFrame, visit: (f: CallFrame) => void): void {
  visit(frame);
  for (const child of frame.calls ?? []) walkCallTree(child, visit);
}

/** Flatten a call tree into pre-order list of (selector, to, type, value, input).
 *  Skips the root frame (it's the txn entry, not a CALL op). */
export function flattenCallTree(frame: CallFrame): FlatCallInfo[] {
  const result: FlatCallInfo[] = [];

  function walk(f: CallFrame) {
    for (const child of f.calls ?? []) {
      result.push({
        selector: child.input?.length >= 10 ? child.input.slice(0, 10).toLowerCase() : "",
        to: child.to ?? "",
        type: child.type ?? "CALL",
        value: child.value,
        input: child.input ?? "0x",
      });
      walk(child);
    }
  }

  walk(frame);
  return result;
}

/**
 * Disambiguate 4byte selector collisions by checking if the calldata
 * length matches each candidate signature's expected parameter count.
 * ABI-encoded params are 32 bytes each (static types), so calldata
 * length = 4 (selector) + 32 * paramCount for simple signatures.
 */
export function bestMatchSignature(
  candidates: SignatureMatch[],
  calldata: string,
): string | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0]!.textSignature;

  const dataBytes = (calldata.startsWith("0x") ? calldata.slice(2) : calldata).length / 2;
  const paramBytes = dataBytes - 4; // subtract selector

  for (const c of candidates) {
    // Count params from the signature: transfer(address,uint256) → 2
    const paramsStr = c.textSignature.split("(")[1]?.replace(")", "") ?? "";
    if (paramsStr === "") {
      if (paramBytes === 0) return c.textSignature;
      continue;
    }
    const paramCount = paramsStr.split(",").length;
    // Static params: each is 32 bytes. Dynamic params add a 32-byte offset pointer.
    // A simple heuristic: paramBytes should be >= 32 * paramCount.
    if (paramBytes >= 32 * paramCount && paramBytes <= 32 * paramCount * 3) {
      return c.textSignature;
    }
  }

  // Fallback: prefer shorter signatures (less likely to be hash collisions)
  return [...candidates].sort((a, b) => a.textSignature.length - b.textSignature.length)[0]?.textSignature;
}
