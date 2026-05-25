/**
 * Per-opcode operand model: which stack items an opcode consumes (its inputs),
 * how many it produces, and which memory region / storage slot it touches.
 *
 * The struct logger reports the stack as it stands BEFORE the opcode runs, with
 * the last array element being the top of stack. So an opcode's inputs are the
 * top `inputs.length` items, in pop order (inputs[0] = top).
 */

interface OpSpec {
  /** Input operand names, top-of-stack first. */
  inputs: string[];
  /** Number of stack items produced. */
  outputs: number;
  /** Memory the op reads/writes, by which input indices give offset & size. */
  mem?: { kind: "read" | "write"; offsetArg: number; sizeArg?: number; fixed?: number };
  /** Input index whose value is the storage slot, for SLOAD/SSTORE. */
  storageArg?: number;
}

const A_B: OpSpec = { inputs: ["a", "b"], outputs: 1 };
const A: OpSpec = { inputs: ["a"], outputs: 1 };
const NULLARY: OpSpec = { inputs: [], outputs: 1 };

const SPECS: Record<string, OpSpec> = {
  // Arithmetic / comparison / bitwise — two in, one out.
  ADD: A_B, MUL: A_B, SUB: A_B, DIV: A_B, SDIV: A_B, MOD: A_B, SMOD: A_B,
  LT: A_B, GT: A_B, SLT: A_B, SGT: A_B, EQ: A_B, AND: A_B, OR: A_B, XOR: A_B,
  BYTE: { inputs: ["i", "x"], outputs: 1 },
  SHL: { inputs: ["shift", "value"], outputs: 1 },
  SHR: { inputs: ["shift", "value"], outputs: 1 },
  SAR: { inputs: ["shift", "value"], outputs: 1 },
  EXP: { inputs: ["base", "exponent"], outputs: 1 },
  SIGNEXTEND: { inputs: ["b", "x"], outputs: 1 },
  ADDMOD: { inputs: ["a", "b", "N"], outputs: 1 },
  MULMOD: { inputs: ["a", "b", "N"], outputs: 1 },
  ISZERO: A, NOT: A,

  // Hashing — reads memory.
  KECCAK256: { inputs: ["offset", "size"], outputs: 1, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
  SHA3: { inputs: ["offset", "size"], outputs: 1, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },

  // Environment / block — no inputs, one out.
  ADDRESS: NULLARY, ORIGIN: NULLARY, CALLER: NULLARY, CALLVALUE: NULLARY,
  CALLDATASIZE: NULLARY, CODESIZE: NULLARY, GASPRICE: NULLARY, RETURNDATASIZE: NULLARY,
  COINBASE: NULLARY, TIMESTAMP: NULLARY, NUMBER: NULLARY, PREVRANDAO: NULLARY,
  DIFFICULTY: NULLARY, GASLIMIT: NULLARY, CHAINID: NULLARY, SELFBALANCE: NULLARY,
  BASEFEE: NULLARY, PC: NULLARY, MSIZE: NULLARY, GAS: NULLARY,
  BALANCE: { inputs: ["address"], outputs: 1 },
  EXTCODESIZE: { inputs: ["address"], outputs: 1 },
  EXTCODEHASH: { inputs: ["address"], outputs: 1 },
  BLOCKHASH: { inputs: ["blockNumber"], outputs: 1 },
  CALLDATALOAD: { inputs: ["offset"], outputs: 1 },

  // Memory copies — write memory.
  CALLDATACOPY: { inputs: ["destOffset", "offset", "size"], outputs: 0, mem: { kind: "write", offsetArg: 0, sizeArg: 2 } },
  CODECOPY: { inputs: ["destOffset", "offset", "size"], outputs: 0, mem: { kind: "write", offsetArg: 0, sizeArg: 2 } },
  RETURNDATACOPY: { inputs: ["destOffset", "offset", "size"], outputs: 0, mem: { kind: "write", offsetArg: 0, sizeArg: 2 } },
  EXTCODECOPY: { inputs: ["address", "destOffset", "offset", "size"], outputs: 0, mem: { kind: "write", offsetArg: 1, sizeArg: 3 } },

  // Memory load/store.
  MLOAD: { inputs: ["offset"], outputs: 1, mem: { kind: "read", offsetArg: 0, fixed: 32 } },
  MSTORE: { inputs: ["offset", "value"], outputs: 0, mem: { kind: "write", offsetArg: 0, fixed: 32 } },
  MSTORE8: { inputs: ["offset", "value"], outputs: 0, mem: { kind: "write", offsetArg: 0, fixed: 1 } },

  // Storage.
  SLOAD: { inputs: ["slot"], outputs: 1, storageArg: 0 },
  SSTORE: { inputs: ["slot", "value"], outputs: 0, storageArg: 0 },
  TLOAD: { inputs: ["slot"], outputs: 1, storageArg: 0 },
  TSTORE: { inputs: ["slot", "value"], outputs: 0, storageArg: 0 },

  // Control flow.
  JUMP: { inputs: ["dest"], outputs: 0 },
  JUMPI: { inputs: ["dest", "cond"], outputs: 0 },
  POP: { inputs: ["x"], outputs: 0 },

  // Calls — read args memory, write return memory.
  CALL: { inputs: ["gas", "address", "value", "argsOffset", "argsSize", "retOffset", "retSize"], outputs: 1, mem: { kind: "read", offsetArg: 3, sizeArg: 4 } },
  CALLCODE: { inputs: ["gas", "address", "value", "argsOffset", "argsSize", "retOffset", "retSize"], outputs: 1, mem: { kind: "read", offsetArg: 3, sizeArg: 4 } },
  DELEGATECALL: { inputs: ["gas", "address", "argsOffset", "argsSize", "retOffset", "retSize"], outputs: 1, mem: { kind: "read", offsetArg: 2, sizeArg: 3 } },
  STATICCALL: { inputs: ["gas", "address", "argsOffset", "argsSize", "retOffset", "retSize"], outputs: 1, mem: { kind: "read", offsetArg: 2, sizeArg: 3 } },

  // Creation / halt — read memory.
  CREATE: { inputs: ["value", "offset", "size"], outputs: 1, mem: { kind: "read", offsetArg: 1, sizeArg: 2 } },
  CREATE2: { inputs: ["value", "offset", "size", "salt"], outputs: 1, mem: { kind: "read", offsetArg: 1, sizeArg: 2 } },
  RETURN: { inputs: ["offset", "size"], outputs: 0, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
  REVERT: { inputs: ["offset", "size"], outputs: 0, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
  SELFDESTRUCT: { inputs: ["address"], outputs: 0 },

  // Logs — read memory; topics from stack.
  LOG0: { inputs: ["offset", "size"], outputs: 0, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
  LOG1: { inputs: ["offset", "size", "topic0"], outputs: 0, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
  LOG2: { inputs: ["offset", "size", "topic0", "topic1"], outputs: 0, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
  LOG3: { inputs: ["offset", "size", "topic0", "topic1", "topic2"], outputs: 0, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
  LOG4: { inputs: ["offset", "size", "topic0", "topic1", "topic2", "topic3"], outputs: 0, mem: { kind: "read", offsetArg: 0, sizeArg: 1 } },
};

function dynamicSpec(op: string): OpSpec | undefined {
  // PUSH0–PUSH32 push one value, consume nothing.
  if (/^PUSH\d+$/.test(op)) return NULLARY;
  // DUPn reads the nth-from-top and pushes a copy.
  const dup = op.match(/^DUP(\d+)$/);
  if (dup) {
    const n = Number(dup[1]);
    const inputs = Array.from({ length: n }, (_, i) => (i === n - 1 ? "value" : "·"));
    return { inputs, outputs: 1 };
  }
  // SWAPn swaps top with the (n+1)th item.
  const swap = op.match(/^SWAP(\d+)$/);
  if (swap) {
    const n = Number(swap[1]);
    const inputs = Array.from({ length: n + 1 }, (_, i) =>
      i === 0 ? "a" : i === n ? "b" : "·",
    );
    return { inputs, outputs: n + 1 };
  }
  return undefined;
}

export interface OperandInfo {
  /** Stack indices (into the pre-execution stack array) that are consumed. */
  inputIndices: number[];
  /** Named operand values resolved from the pre-stack, top-first. */
  args: Array<{ name: string; value: string }>;
  outputs: number;
  /** Memory region the op reads or writes, if any. */
  memory: { kind: "read" | "write"; offset: number; size: number } | null;
  /** Storage slot the op reads or writes, if any. */
  storageSlot: string | null;
  /** A compact signature like `MSTORE(offset, value)`. */
  signature: string;
}

function toNum(hex: string | undefined): number {
  if (!hex) return 0;
  try {
    const n = BigInt(hex);
    // Clamp absurd offsets/sizes so a bad value can't blow up the UI.
    return n > 0xffffffffn ? Number.MAX_SAFE_INTEGER : Number(n);
  } catch {
    return 0;
  }
}

/**
 * Describe what the opcode at `op` does to `preStack` (the stack before it
 * executes, last element = top). Returns null for opcodes we don't model.
 */
export function describeOperands(op: string, preStack: string[]): OperandInfo | null {
  const spec = SPECS[op] ?? dynamicSpec(op);
  if (!spec) return null;

  const len = preStack.length;
  const inputIndices: number[] = [];
  const args: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < spec.inputs.length; i++) {
    const stackIdx = len - 1 - i; // top-first
    if (stackIdx < 0) break;
    inputIndices.push(stackIdx);
    const name = spec.inputs[i]!;
    if (name !== "·") args.push({ name, value: preStack[stackIdx]! });
  }

  let memory: OperandInfo["memory"] = null;
  if (spec.mem) {
    const offset = toNum(preStack[len - 1 - spec.mem.offsetArg]);
    const size = spec.mem.fixed ?? toNum(preStack[len - 1 - (spec.mem.sizeArg ?? 0)]);
    memory = { kind: spec.mem.kind, offset, size };
  }

  let storageSlot: string | null = null;
  if (spec.storageArg !== undefined) {
    storageSlot = preStack[len - 1 - spec.storageArg] ?? null;
  }

  const argNames = spec.inputs.filter((n) => n !== "·");
  const signature = `${op}(${argNames.join(", ")})`;

  return { inputIndices, args, outputs: spec.outputs, memory, storageSlot, signature };
}
