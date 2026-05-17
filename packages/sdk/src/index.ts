// Canonical types
export type {
  BalanceDelta,
  CallType,
  DecodedParam,
  GasProfile,
  GasProfileEntry,
  Log,
  OpcodeStep,
  RawCallFrame,
  RawCallType,
  RawLog,
  RawPrestateAccount,
  RawPrestateDiff,
  RawStructLog,
  SourceLocation,
  StateDiff,
  StorageChange,
  TokenDelta,
  TraceFrame,
  TraceResult,
} from "./types.js";

// Consumer-friendly type aliases.
// `CallNode` is the same shape as `TraceFrame` — exported under the name
// external consumers expect (per the SDK API contract).
export type { TraceFrame as CallNode } from "./types.js";

// Loaders
export {
  loadTraceFromObject,
  loadTraceFromFile,
  loadTraceFromHash,
  normalizeCallFrame,
  // Consumer-friendly alias for `normalizeCallFrame`. Same function, the
  // name the external API contract uses.
  normalizeCallFrame as parseCallTrace,
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

// Parsers
export {
  parseTokenDeltas,
  parsePrestateDiff,
} from "./parsers/index.js";

// Components (React peer dep)
export {
  CallTree,
  GasFlamegraph,
  OpcodeViewer,
  buildFlamegraphLayout,
  adjustBrightness,
  getBarColor,
  classifyOpcode,
  getOpcodeColor,
  isExpensiveOp,
  OPCODE_CATEGORY_COLORS,
  truncateAddress,
  formatGas,
  formatWei,
  getFunctionSelector,
  type CallTreeProps,
  type CallTreeClassNames,
  type GasFlamegraphProps,
  type GasFlamegraphClassNames,
  type OpcodeViewerProps,
  type OpcodeViewerClassNames,
  type OpcodeCategory,
  type FlamegraphBar,
  type LayoutOptions,
} from "./components/index.js";
