/**
 * Solidity compiler source maps are encoded as semicolon-separated
 * entries `s:l:f:j:m` where:
 *
 *   s = byte offset in source
 *   l = byte length in source
 *   f = source file index
 *   j = jump type ("i" into, "o" out, "-" regular)
 *   m = modifier depth (we don't use this — ignored)
 *
 * Empty fields inherit from the previous entry (run-length compression).
 */

export interface SourceMapEntry {
  offset: number;
  length: number;
  fileIndex: number;
  jumpType: string;
}

export function decodeSourceMap(encoded: string): SourceMapEntry[] {
  const entries: SourceMapEntry[] = [];
  let prev: SourceMapEntry = {
    offset: 0,
    length: 0,
    fileIndex: 0,
    jumpType: "-",
  };

  for (const raw of encoded.split(";")) {
    if (raw === "") {
      entries.push({ ...prev });
      continue;
    }

    const parts = raw.split(":");
    const entry: SourceMapEntry = {
      offset:
        parts[0] !== undefined && parts[0] !== ""
          ? parseInt(parts[0], 10)
          : prev.offset,
      length:
        parts[1] !== undefined && parts[1] !== ""
          ? parseInt(parts[1], 10)
          : prev.length,
      fileIndex:
        parts[2] !== undefined && parts[2] !== ""
          ? parseInt(parts[2], 10)
          : prev.fileIndex,
      jumpType:
        parts[3] !== undefined && parts[3] !== "" ? parts[3] : prev.jumpType,
    };

    entries.push(entry);
    prev = entry;
  }

  return entries;
}

/**
 * Walk deployed bytecode to map opcode index → program counter (byte
 * offset). EVM opcodes are 1 byte except PUSH1..PUSH32 (0x60..0x7f)
 * which consume 1 + N bytes (N = opcodeByte - 0x5f).
 */
export function buildPcToOpcodeIndex(
  deployedBytecode: string,
): Map<number, number> {
  const bytecode = deployedBytecode.startsWith("0x")
    ? deployedBytecode.slice(2)
    : deployedBytecode;

  const pcToIndex = new Map<number, number>();
  let opcodeIndex = 0;
  let pc = 0;

  while (pc < bytecode.length / 2) {
    pcToIndex.set(pc, opcodeIndex);

    const opcodeByte = parseInt(bytecode.slice(pc * 2, pc * 2 + 2), 16);

    if (opcodeByte >= 0x60 && opcodeByte <= 0x7f) {
      const pushSize = opcodeByte - 0x5f;
      pc += 1 + pushSize;
    } else {
      pc += 1;
    }

    opcodeIndex++;
  }

  return pcToIndex;
}
