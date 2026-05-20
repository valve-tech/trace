/**
 * Opcode → human-readable category mapping for the opcode-level gas
 * profiler. Categories are intentionally coarse — the goal is "where did
 * the gas go" at a glance (storage vs memory vs compute), not bytecode
 * forensics.
 *
 * Anything not in this table falls through to "Compute" via
 * `categorizeOpcode`. PUSH1..PUSH32 are added programmatically below
 * since enumerating them inline would double the file size for no
 * meaning.
 */
const OPCODE_CATEGORIES: Record<string, string> = {
  // Storage
  SLOAD: "Storage",
  SSTORE: "Storage",
  // Memory
  MLOAD: "Memory",
  MSTORE: "Memory",
  MSTORE8: "Memory",
  MSIZE: "Memory",
  MCOPY: "Memory",
  // Calls
  CALL: "External Calls",
  STATICCALL: "External Calls",
  DELEGATECALL: "External Calls",
  CALLCODE: "External Calls",
  CREATE: "External Calls",
  CREATE2: "External Calls",
  SELFDESTRUCT: "External Calls",
  // Logs
  LOG0: "Logging",
  LOG1: "Logging",
  LOG2: "Logging",
  LOG3: "Logging",
  LOG4: "Logging",
  // Hashing
  SHA3: "Hashing",
  KECCAK256: "Hashing",
  // Stack
  POP: "Stack",
  PUSH0: "Stack",
  DUP1: "Stack",
  DUP2: "Stack",
  DUP3: "Stack",
  DUP4: "Stack",
  DUP5: "Stack",
  DUP6: "Stack",
  DUP7: "Stack",
  DUP8: "Stack",
  DUP9: "Stack",
  DUP10: "Stack",
  DUP11: "Stack",
  DUP12: "Stack",
  DUP13: "Stack",
  DUP14: "Stack",
  DUP15: "Stack",
  DUP16: "Stack",
  SWAP1: "Stack",
  SWAP2: "Stack",
  SWAP3: "Stack",
  SWAP4: "Stack",
  SWAP5: "Stack",
  SWAP6: "Stack",
  SWAP7: "Stack",
  SWAP8: "Stack",
  SWAP9: "Stack",
  SWAP10: "Stack",
  SWAP11: "Stack",
  SWAP12: "Stack",
  SWAP13: "Stack",
  SWAP14: "Stack",
  SWAP15: "Stack",
  SWAP16: "Stack",
  // Control flow
  JUMP: "Control Flow",
  JUMPI: "Control Flow",
  JUMPDEST: "Control Flow",
  STOP: "Control Flow",
  RETURN: "Control Flow",
  REVERT: "Control Flow",
  INVALID: "Control Flow",
  // Environment
  ADDRESS: "Environment",
  BALANCE: "Environment",
  ORIGIN: "Environment",
  CALLER: "Environment",
  CALLVALUE: "Environment",
  CALLDATALOAD: "Environment",
  CALLDATASIZE: "Environment",
  CALLDATACOPY: "Environment",
  CODESIZE: "Environment",
  CODECOPY: "Environment",
  GASPRICE: "Environment",
  EXTCODESIZE: "Environment",
  EXTCODECOPY: "Environment",
  RETURNDATASIZE: "Environment",
  RETURNDATACOPY: "Environment",
  EXTCODEHASH: "Environment",
  BLOCKHASH: "Environment",
  COINBASE: "Environment",
  TIMESTAMP: "Environment",
  NUMBER: "Environment",
  DIFFICULTY: "Environment",
  PREVRANDAO: "Environment",
  GASLIMIT: "Environment",
  CHAINID: "Environment",
  SELFBALANCE: "Environment",
  BASEFEE: "Environment",
  GAS: "Environment",
};

// PUSH1..PUSH32 all map to "Stack".
for (let i = 1; i <= 32; i++) {
  OPCODE_CATEGORIES[`PUSH${i}`] = "Stack";
}

export function categorizeOpcode(op: string): string {
  return OPCODE_CATEGORIES[op] ?? "Compute";
}
