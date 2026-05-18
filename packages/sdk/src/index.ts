// Canonical types
export type {
  AnalyzeRisksOptions,
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
  RiskFlag,
  RiskFlagType,
  RiskSeverity,
  SourceLocation,
  StateDiff,
  StorageChange,
  TokenApproval,
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
  parseApprovals,
} from "./parsers/index.js";

// Risks
export {
  analyzeRisks,
  BUILTIN_RULES,
  delegatecallUnrecognized,
  largeApproval,
  type RiskRule,
} from "./risks/index.js";

// Components (React peer dep)
export {
  CallTree,
  GasFlamegraph,
  OpcodeViewer,
  FindingsPanel,
  StateDiffPanel,
  FrameDetailPanel,
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
  type FindingsPanelProps,
  type FindingsPanelClassNames,
  type StateDiffPanelProps,
  type StateDiffPanelClassNames,
  type FrameDetailPanelProps,
  type FrameDetailPanelClassNames,
  type OpcodeCategory,
  type FlamegraphBar,
  type LayoutOptions,
} from "./components/index.js";

// Templates (composition of components — React peer dep)
export {
  CompactCallSummary,
  RevertExplainer,
  FullDebuggerLayout,
  type CompactCallSummaryProps,
  type CompactCallSummaryClassNames,
  type RevertExplainerProps,
  type RevertExplainerClassNames,
  type FullDebuggerLayoutProps,
  type FullDebuggerLayoutClassNames,
  type FullDebuggerTabId,
} from "./templates/index.js";

// Hooks (React peer dep)
export {
  useOpcodeNavigation,
  isCallOp,
  isStorageOp,
  isLogOp,
  type OpcodeNavigation,
  type UseOpcodeNavigationOptions,
} from "./hooks/index.js";
