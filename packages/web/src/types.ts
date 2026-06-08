/** Storage slot override: mapping of slot hex => value hex */
export type StorageOverrides = Record<string, string>;

/** State override for a single address */
export interface StateOverride {
  address: string;
  balance?: string;
  nonce?: string;
  code?: string;
  storage?: StorageOverrides;
}

/** Parameters for a single transaction simulation */
export interface SimulationRequest {
  from: string;
  to: string;
  value?: string;
  data?: string;
  gasLimit?: number;
  blockNumber?: string;
  stateOverrides?: StateOverride[];
  abi?: string;
}

/** Decoded parameter from ABI */
export interface DecodedParam {
  name: string;
  type: string;
  value: string;
}

/** Decoded function call */
export interface DecodedCall {
  functionName: string;
  params: DecodedParam[];
}

/** Decoded return value */
export interface DecodedReturn {
  values: DecodedParam[];
}

/**
 * Result of a single simulation. Mirrors the API's `/api/simulate` payload
 * (services/simulator/simulateTransaction.ts → routes/simulate.ts): the gas
 * field is `gasEstimate` (a string, or `null` when the call reverts before a
 * gas figure is available), NOT `gasUsed`. Consumers must null-guard it before
 * `BigInt(...)`.
 */
export interface SimulationResult {
  success: boolean;
  gasEstimate: string | null;
  returnData: string | null;
  revertReason?: string | null;
  error?: string | null;
  decodedCall?: DecodedCall;
  decodedReturn?: DecodedReturn;
  logs?: SimulationLog[];
}

/** Log entry emitted during simulation */
export interface SimulationLog {
  address: string;
  topics: string[];
  data: string;
  decoded?: {
    eventName: string;
    params: DecodedParam[];
  };
}

/** Bundle simulation request */
export interface BundleSimulationRequest {
  transactions: SimulationRequest[];
}

/** Bundle simulation result */
export interface BundleSimulationResult {
  results: SimulationResult[];
}

/** A single transaction entry in the bundle form */
export interface BundleTxEntry {
  id: string;
  from: string;
  to: string;
  value: string;
  data: string;
  gasLimit: string;
}
