/**
 * Opcode-structure comparison for verifying that a recompiled contract's
 * source map can be trusted against an on-chain trace.
 *
 * A source map maps each *opcode index* to a source range. So the source map
 * is valid for a deployed contract iff the recompiled bytecode has the SAME
 * sequence of opcodes at the same program counters. It does NOT require
 * byte-identical bytecode: `immutable` values and linked library addresses are
 * baked into PUSH *operand* bytes at deploy/link time, which differ from a
 * fresh recompile but don't change the opcode sequence or any PC. Comparing
 * opcode structure (ignoring PUSH operands) tolerates those while still
 * catching a genuinely-wrong compilation (wrong optimizer runs, evmVersion,
 * source, or contract), where opcode positions shift.
 */

/**
 * Strip the trailing CBOR metadata blob solc appends to runtime bytecode.
 * The last 2 bytes encode the metadata length N; the blob is the preceding
 * N bytes plus those 2 length bytes. Returns the input unchanged when the
 * encoded length is implausible (no/[]malformed metadata).
 */
export function stripMetadata(hex: string): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length < 4) return h;
  const lenBytes = parseInt(h.slice(-4), 16);
  if (Number.isNaN(lenBytes)) return h;
  const cutChars = (lenBytes + 2) * 2;
  if (cutChars >= h.length) return h; // implausible — leave as-is
  return h.slice(0, h.length - cutChars);
}

/**
 * Disassemble runtime bytecode into its sequence of opcode bytes, skipping
 * PUSH operands (PUSH1..PUSH32 = 0x60..0x7f consume 1 + N operand bytes).
 * Metadata is stripped first. The result is the structural fingerprint used
 * for source-map validity.
 */
export function opcodeStructure(hex: string): number[] {
  const b = stripMetadata(hex);
  const ops: number[] = [];
  for (let pc = 0; pc < b.length / 2; ) {
    const op = parseInt(b.slice(pc * 2, pc * 2 + 2), 16);
    if (Number.isNaN(op)) break;
    ops.push(op);
    pc += op >= 0x60 && op <= 0x7f ? 1 + (op - 0x5f) : 1;
  }
  return ops;
}

/**
 * True when two runtime bytecodes share the same opcode structure — i.e. a
 * source map generated for one is valid for the other. Tolerates immutable
 * and library-address operand differences; rejects structural divergence.
 */
export function structuresMatch(a: string, b: string): boolean {
  const oa = opcodeStructure(a);
  const ob = opcodeStructure(b);
  if (oa.length !== ob.length) return false;
  for (let i = 0; i < oa.length; i++) {
    if (oa[i] !== ob[i]) return false;
  }
  return true;
}
