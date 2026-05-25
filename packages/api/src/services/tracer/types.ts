/**
 * Shared types for the tracer service. CallFrame mirrors geth's callTracer
 * output; OpcodeStep mirrors the struct-logger output. These shapes are
 * what the routes serialize directly to the wire, so changes here are
 * client-visible.
 */

export interface CallFrame {
  type: string;
  from: string;
  to: string;
  value?: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  error?: string;
  calls?: CallFrame[];
}

export interface CallTraceResult {
  trace: CallFrame | null;
  error: string | null;
  debugAvailable: boolean;
}

export interface OpcodeStep {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  stack: string[];
  memory: string[];
  storage: Record<string, string>;
}

export interface OpcodeTraceResult {
  steps: OpcodeStep[];
  gas: number;
  returnValue: string;
  error: string | null;
  debugAvailable: boolean;
}

/**
 * A skeleton step carries only the navigation-relevant fields — no stack,
 * memory, or storage. The struct logger is run with those disabled so the
 * FULL execution (often 100k+ steps) fits without the stack, which is ~70%
 * of a full struct-log payload. Drives call-tree mapping, the opcode list,
 * stepping, and gas; per-step state is fetched lazily via getOpcodeDetail.
 */
export interface SkeletonStep {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
}

export interface SkeletonTraceResult {
  steps: SkeletonStep[];
  gas: number;
  returnValue: string;
  error: string | null;
  debugAvailable: boolean;
}

/** Per-step EVM state, fetched lazily for a window of steps around the cursor. */
export interface StepDetail {
  stack: string[];
  memory: string[];
  storage: Record<string, string>;
}

export interface StepDetailResult {
  /** Map of absolute step index → state. Sparse: only the requested window. */
  detail: Record<number, StepDetail>;
  error: string | null;
  debugAvailable: boolean;
}

export interface TraceCallParams {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
}
