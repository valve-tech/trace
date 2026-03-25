import type { Abi, Address, Hex } from "viem";
import {
  decodeErrorResult,
  BaseError,
  RawContractError,
  ContractFunctionRevertedError,
} from "viem";
import { publicClient } from "./rpc.js";
import { estimateGas } from "./gasEstimator.js";
import { decodeInput, decodeOutput, resolveAbi } from "./decoder.js";
import type {
  SimulateRequest,
  SimulationResult,
  StateOverrideMap,
} from "../types.js";

// ---------------------------------------------------------------------------
// Convert user-facing state overrides to the format viem/geth expects.
// ---------------------------------------------------------------------------

function buildStateOverride(overrides?: StateOverrideMap) {
  if (!overrides || Object.keys(overrides).length === 0) {
    return undefined;
  }

  const stateOverride: Array<{
    address: Address;
    balance?: bigint;
    nonce?: number;
    code?: Hex;
    stateDiff?: Array<{ slot: Hex; value: Hex }>;
  }> = [];

  for (const [addr, entry] of Object.entries(overrides)) {
    const item: (typeof stateOverride)[number] = {
      address: addr as Address,
    };

    if (entry.balance !== undefined) {
      item.balance = BigInt(entry.balance);
    }
    if (entry.nonce !== undefined) {
      item.nonce = entry.nonce;
    }
    if (entry.code !== undefined) {
      item.code = entry.code as Hex;
    }
    if (entry.stateDiff !== undefined) {
      item.stateDiff = Object.entries(entry.stateDiff).map(([slot, value]) => ({
        slot: slot as Hex,
        value: value as Hex,
      }));
    }

    stateOverride.push(item);
  }

  return stateOverride;
}

// ---------------------------------------------------------------------------
// Revert reason extraction
// ---------------------------------------------------------------------------

/**
 * Try to extract a human-readable revert reason from an error.
 */
function extractRevertReason(err: unknown, abi?: Abi | null): string | null {
  // viem wraps revert data in specific error classes.
  if (err instanceof BaseError) {
    // Walk the cause chain looking for revert data.
    const revertError = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.reason ?? revertError.shortMessage ?? err.shortMessage;
    }

    const rawError = err.walk((e) => e instanceof RawContractError);
    if (rawError instanceof RawContractError && rawError.data) {
      try {
        const decoded = decodeErrorResult({
          abi: (abi ?? []) as Abi,
          data: rawError.data as Hex,
        });
        return `${decoded.errorName}(${decoded.args?.map(String).join(", ") ?? ""})`;
      } catch {
        // Could not decode with provided ABI; try the standard Error(string).
        try {
          const decoded = decodeErrorResult({
            abi: [
              {
                type: "error",
                name: "Error",
                inputs: [{ name: "message", type: "string" }],
              },
            ] as Abi,
            data: rawError.data as Hex,
          });
          return String(decoded.args?.[0] ?? "Unknown revert");
        } catch {
          return rawError.data as string;
        }
      }
    }

    return err.shortMessage ?? err.message;
  }

  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
}

// ---------------------------------------------------------------------------
// Core simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a single transaction against PulseChain via `eth_call`,
 * decode the result, and estimate gas.
 */
export async function simulateTransaction(
  req: SimulateRequest,
): Promise<SimulationResult> {
  const fromAddr = req.from as string | undefined;
  const toAddr = req.to as string | undefined;
  const valueHex = req.value as string | undefined;
  const dataHex = req.data as string | undefined;
  const gasHex = req.gas as string | undefined;
  const gasPriceHex = req.gasPrice as string | undefined;

  const abi = await resolveAbi(req.abi, toAddr);

  // Build the call parameters.
  const callParams: Record<string, unknown> = {};
  if (fromAddr) callParams.account = fromAddr as Address;
  if (toAddr) callParams.to = toAddr as Address;
  if (valueHex) callParams.value = BigInt(valueHex);
  if (dataHex) callParams.data = dataHex as Hex;
  if (gasHex) callParams.gas = BigInt(gasHex);
  if (gasPriceHex) callParams.gasPrice = BigInt(gasPriceHex);

  // Block number (default: latest).
  if (req.blockNumber !== undefined) {
    const bn = BigInt(req.blockNumber as string | number);
    callParams.blockNumber = bn;
  }

  // State overrides.
  const stateOverride = buildStateOverride(
    req.stateOverrides as StateOverrideMap | undefined,
  );
  if (stateOverride) {
    callParams.stateOverride = stateOverride;
  }

  // --- Execute eth_call ---
  let returnData: Hex | null = null;
  let revertReason: string | null = null;
  let success = false;
  let decodedInput = null;
  let decodedOutput = null;
  let errorMsg: string | null = null;

  try {
    const result = await publicClient.call(callParams as any);
    returnData = (result.data as Hex) ?? "0x";
    success = true;
  } catch (err) {
    success = false;
    revertReason = extractRevertReason(err, abi);
    errorMsg = revertReason;
  }

  // --- Decode input ---
  if (abi && dataHex) {
    decodedInput = decodeInput(dataHex as Hex, abi);
  }

  // --- Decode output ---
  if (success && abi && returnData && decodedInput?.functionName) {
    decodedOutput = decodeOutput(returnData, abi, decodedInput.functionName);
  }

  // --- Gas estimate (best effort, runs in parallel conceptually) ---
  const gasEstimate = await estimateGas({
    from: fromAddr as Address | undefined,
    to: toAddr as Address | undefined,
    value: valueHex ? BigInt(valueHex) : undefined,
    data: dataHex as Hex | undefined,
    gas: gasHex ? BigInt(gasHex) : undefined,
    gasPrice: gasPriceHex ? BigInt(gasPriceHex) : undefined,
  });

  return {
    success,
    returnData,
    decodedOutput,
    decodedInput,
    gasEstimate,
    revertReason,
    error: errorMsg,
  };
}

/**
 * Simulate a bundle of transactions sequentially.
 *
 * Each transaction is simulated in order. The cumulative state overrides from
 * earlier transactions are merged into subsequent ones so that side-effects
 * compose. Note: because `eth_call` is read-only, true state propagation
 * requires the caller to supply explicit `stateOverrides` between steps.
 * This function merges them automatically where provided.
 */
export async function simulateBundle(
  transactions: SimulateRequest[],
  blockNumber?: string | number,
): Promise<SimulationResult[]> {
  const results: SimulationResult[] = [];

  // Cumulative state overrides that carry forward across the bundle.
  let cumulativeOverrides: StateOverrideMap = {};

  for (const tx of transactions) {
    // Merge cumulative overrides with per-tx overrides (per-tx wins).
    const mergedOverrides: StateOverrideMap = {
      ...cumulativeOverrides,
    };

    const txOverrides = tx.stateOverrides as StateOverrideMap | undefined;
    if (txOverrides) {
      for (const [addr, entry] of Object.entries(txOverrides)) {
        const existing = mergedOverrides[addr as Address];
        if (existing) {
          mergedOverrides[addr as Address] = {
            ...existing,
            ...entry,
            stateDiff: {
              ...existing.stateDiff,
              ...entry.stateDiff,
            },
          };
        } else {
          mergedOverrides[addr as Address] = entry;
        }
      }
    }

    const enrichedTx: SimulateRequest = {
      ...tx,
      blockNumber: tx.blockNumber ?? blockNumber,
      stateOverrides:
        Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined,
    };

    const result = await simulateTransaction(enrichedTx);
    results.push(result);

    // Carry forward the merged overrides for the next tx in the bundle.
    cumulativeOverrides = mergedOverrides;
  }

  return results;
}
