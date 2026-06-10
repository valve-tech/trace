import { z } from "zod";
import type { Hex, Address } from "viem";

// ---------------------------------------------------------------------------
// Zod schemas – used for runtime request validation
// ---------------------------------------------------------------------------

const hexStringSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "Must be a hex string starting with 0x");

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid 40-character hex address");

/** Per-account state override (matches geth / viem conventions). */
const stateOverrideSchema = z.object({
  balance: hexStringSchema.optional(),
  nonce: z.number().int().nonnegative().optional(),
  code: hexStringSchema.optional(),
  stateDiff: z.record(z.string(), hexStringSchema).optional(),
});

/**
 * Target chain for a simulation. Optional — the route resolves the default
 * (369) and rejects unsupported ids via `resolveChainIdParam`
 * (lib/chainParam.ts), keeping registry knowledge out of the schema.
 */
const chainIdFieldSchema = z.coerce.number().int().positive().optional();

/** A single simulation transaction request. */
export const simulateRequestSchema = z.object({
  from: addressSchema.optional(),
  to: addressSchema.optional(),
  value: hexStringSchema.optional(),
  data: hexStringSchema.optional(),
  gas: hexStringSchema.optional(),
  gasPrice: hexStringSchema.optional(),
  blockNumber: z.union([hexStringSchema, z.number().int().nonnegative()]).optional(),
  chainid: chainIdFieldSchema,
  stateOverrides: z.record(addressSchema, stateOverrideSchema).optional(),
  /** Optional ABI for decoding. Accepts any valid JSON ABI array. */
  abi: z.any().optional(),
});

/** Bundle: ordered list of transactions simulated sequentially. */
export const simulateBundleRequestSchema = z.object({
  transactions: z.array(simulateRequestSchema).min(1).max(50),
  blockNumber: z.union([hexStringSchema, z.number().int().nonnegative()]).optional(),
  chainid: chainIdFieldSchema,
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type SimulateRequest = z.infer<typeof simulateRequestSchema>;
export type SimulateBundleRequest = z.infer<typeof simulateBundleRequestSchema>;

export interface StateOverrideEntry {
  balance?: Hex;
  nonce?: number;
  code?: Hex;
  stateDiff?: Record<string, Hex>;
}

export type StateOverrideMap = Record<Address, StateOverrideEntry>;

export interface DecodedParam {
  name: string;
  type: string;
  value: unknown;
}

export interface DecodedFunction {
  functionName: string;
  args: DecodedParam[];
}

export interface DecodedOutput {
  values: DecodedParam[];
}

export interface DecodedEvent {
  eventName: string;
  args: DecodedParam[];
}

export interface SimulationResult {
  success: boolean;
  /** Raw hex return data (or revert data). */
  returnData: Hex | null;
  /** Decoded output values when ABI is available. */
  decodedOutput: DecodedOutput | null;
  /** Decoded input when ABI is available. */
  decodedInput: DecodedFunction | null;
  /** Estimated gas (via eth_estimateGas). */
  gasEstimate: bigint | null;
  /** Human-readable revert reason, if any. */
  revertReason: string | null;
  /** Any error message from the simulation. */
  error: string | null;
}

export interface BundleSimulationResult {
  blockNumber: number | string | null;
  results: SimulationResult[];
}
