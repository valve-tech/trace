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

// Components (React peer dep)
export {
  CallTree,
  GasFlamegraph,
  buildFlamegraphLayout,
  adjustBrightness,
  getBarColor,
  truncateAddress,
  formatGas,
  formatWei,
  getFunctionSelector,
  type CallTreeProps,
  type CallTreeClassNames,
  type GasFlamegraphProps,
  type GasFlamegraphClassNames,
  type FlamegraphBar,
  type LayoutOptions,
} from "./components/index.js";
