// Canonical types
export type {
  CallType,
  DecodedParam,
  GasProfile,
  GasProfileEntry,
  OpcodeStep,
  RawCallFrame,
  RawCallType,
  RawStructLog,
  SourceLocation,
  StateDiff,
  StorageChange,
  TraceFrame,
  TraceResult,
} from "./types.js";

// Loaders
export {
  loadTraceFromObject,
  loadTraceFromFile,
  loadTraceFromHash,
  normalizeCallFrame,
  normalizeStructLogs,
  type LoadObjectInput,
  type LoadHashOptions,
} from "./loaders/index.js";

// Traversal
export {
  walkCallTree,
  flattenCallTree,
  filterByAddress,
  filterBySelector,
  findRevertFrame,
  buildGasProfile,
  type WalkVisitor,
  type FlatFrame,
  type AddressMatchOptions,
} from "./traversal/index.js";
