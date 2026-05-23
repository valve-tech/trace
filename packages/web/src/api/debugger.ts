/**
 * API client for the debugger endpoints.
 */

import type { OpcodeStep as SdkOpcodeStep, RawCallFrame } from "@valve-tech/trace-sdk";

const API_BASE = "/api/debug";

// ---------------------------------------------------------------------------
// Types (mirroring backend)
//
// CallFrame is a wire-format alias of the SDK's RawCallFrame. Normalize it
// (via SDK `normalizeCallFrame`) at the render boundary before passing to
// SDK components.
//
// OpcodeStep is re-exported from the SDK so web's hooks (`useOpcodeNavigation`)
// see the same type identity. The API server always populates stack/memory/
// storage, which matches the SDK's post-normalize shape.
// ---------------------------------------------------------------------------

export type CallFrame = RawCallFrame;
export type OpcodeStep = SdkOpcodeStep;

export interface GasEntry {
  function: string;
  address: string;
  callType: string;
  gasUsed: number;
  totalGas: number;
  percentage: number;
  depth: number;
  children: GasEntry[];
}

export interface FlatGasEntry {
  depth: number;
  function: string;
  address: string;
  callType: string;
  gasUsed: number;
  percentage: number;
}

export interface GasProfile {
  totalGas: number;
  entries: GasEntry[];
  flat: FlatGasEntry[];
  byCallType: Record<string, number>;
}

export interface OpcodeCategory {
  category: string;
  gas: number;
  count: number;
  percentage: number;
}

export interface ExpensiveOp {
  step: number;
  pc: number;
  op: string;
  gasCost: number;
}

export interface OpcodeProfile {
  totalGas: number;
  categories: OpcodeCategory[];
  topExpensive: ExpensiveOp[];
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface TraceResponse {
  ok: boolean;
  trace?: CallFrame;
  error?: string;
  debugAvailable?: boolean;
}

export interface OpcodeResponse {
  ok: boolean;
  steps?: OpcodeStep[];
  gas?: number;
  returnValue?: string;
  error?: string;
  debugAvailable?: boolean;
}

export interface GasProfileResponse {
  ok: boolean;
  gasProfile?: GasProfile;
  opcodeProfile?: OpcodeProfile | null;
  error?: string;
  debugAvailable?: boolean;
}

export interface SimulatedTraceResponse {
  ok: boolean;
  trace?: CallFrame;
  gasProfile?: GasProfile | null;
  error?: string;
  debugAvailable?: boolean;
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Get the call-tree trace for a transaction.
 */
export async function fetchTrace(hash: string): Promise<TraceResponse> {
  const res = await fetch(`${API_BASE}/tx/${hash}/trace`);
  if (!res.ok) {
    const error = await parseError(res);
    const body = (() => {
      try {
        return JSON.parse(error);
      } catch {
        return null;
      }
    })();
    return {
      ok: false,
      error: typeof body === "object" && body?.error ? body.error : error,
      debugAvailable: typeof body === "object" ? body?.debugAvailable : undefined,
    };
  }
  return (await res.json()) as TraceResponse;
}

/**
 * Get the opcode-level trace for a transaction.
 */
export async function fetchOpcodes(
  hash: string,
  limit: number = 10000,
): Promise<OpcodeResponse> {
  const res = await fetch(`${API_BASE}/tx/${hash}/opcodes?limit=${limit}`);
  if (!res.ok) {
    const error = await parseError(res);
    const body = (() => {
      try {
        return JSON.parse(error);
      } catch {
        return null;
      }
    })();
    return {
      ok: false,
      error: typeof body === "object" && body?.error ? body.error : error,
      debugAvailable: typeof body === "object" ? body?.debugAvailable : undefined,
    };
  }
  return (await res.json()) as OpcodeResponse;
}

/**
 * Get gas profiler data for a transaction.
 */
export async function fetchGasProfile(hash: string): Promise<GasProfileResponse> {
  const res = await fetch(`${API_BASE}/tx/${hash}/gas-profile`);
  if (!res.ok) {
    const error = await parseError(res);
    const body = (() => {
      try {
        return JSON.parse(error);
      } catch {
        return null;
      }
    })();
    return {
      ok: false,
      error: typeof body === "object" && body?.error ? body.error : error,
      debugAvailable: typeof body === "object" ? body?.debugAvailable : undefined,
    };
  }
  return (await res.json()) as GasProfileResponse;
}

/**
 * Trace a simulated (not yet on-chain) call.
 */
export async function fetchSimulatedTrace(params: {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
}): Promise<SimulatedTraceResponse> {
  const res = await fetch(`${API_BASE}/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const error = await parseError(res);
    const body = (() => {
      try {
        return JSON.parse(error);
      } catch {
        return null;
      }
    })();
    return {
      ok: false,
      error: typeof body === "object" && body?.error ? body.error : error,
      debugAvailable: typeof body === "object" ? body?.debugAvailable : undefined,
    };
  }
  return (await res.json()) as SimulatedTraceResponse;
}
