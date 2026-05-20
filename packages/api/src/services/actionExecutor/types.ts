/**
 * Public + internal types for the action executor.
 *
 * `ExecutionResult` and `TriggerEvent` are part of the actions API — the
 * routes and scheduler consume them. `ChildInput` / `ChildOutput` are
 * the wire format between parent and child; both sides JSON-serialize
 * across stdin/stdout so the shape must stay frozen here when changes
 * cross between `runInChild` and the embedded child script.
 */

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  duration_ms: number;
  error?: string;
}

export interface TriggerEvent {
  type: string;
  blockNumber?: number;
  txHash?: string;
  [key: string]: unknown;
}

export interface ChildInput {
  code: string;
  event: TriggerEvent;
  secrets: Record<string, string>;
  storage: Record<string, unknown>;
  rpcUrl: string;
  timeoutMs: number;
}

export interface ChildOutput {
  stdout: string[];
  stderr: string[];
  storage: Record<string, unknown>;
  error?: string;
}
