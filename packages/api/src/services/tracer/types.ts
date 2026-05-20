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

export interface TraceCallParams {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
}
