import type { Address, Hex } from "viem";
import { publicClient } from "../rpc.js";
import { estimateGas } from "../gasEstimator.js";
import { decodeInput, decodeOutput, resolveAbi } from "../decoder.js";
import type {
  SimulateRequest,
  SimulationResult,
  StateOverrideMap,
} from "../../types.js";
import { buildStateOverride } from "./stateOverride.js";
import { extractRevertReason } from "./revertReason.js";

/**
 * Simulate a single transaction against PulseChain via `eth_call`,
 * decode the result against the resolved ABI, and estimate gas in
 * parallel. Errors are captured as `revertReason` + `error` so callers
 * see a typed failure path rather than an exception.
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

  const callParams: Record<string, unknown> = {};
  if (fromAddr) callParams.account = fromAddr as Address;
  if (toAddr) callParams.to = toAddr as Address;
  if (valueHex) callParams.value = BigInt(valueHex);
  if (dataHex) callParams.data = dataHex as Hex;
  if (gasHex) callParams.gas = BigInt(gasHex);
  if (gasPriceHex) callParams.gasPrice = BigInt(gasPriceHex);

  if (req.blockNumber !== undefined) {
    callParams.blockNumber = BigInt(req.blockNumber as string | number);
  }

  const stateOverride = buildStateOverride(
    req.stateOverrides as StateOverrideMap | undefined,
  );
  if (stateOverride) {
    callParams.stateOverride = stateOverride;
  }

  let returnData: Hex | null = null;
  let revertReason: string | null = null;
  let success = false;
  let decodedInput = null;
  let decodedOutput = null;
  let errorMsg: string | null = null;

  try {
    // viem's call() takes a strictly typed union; we're building params
    // dynamically from optional user input so the dynamic shape doesn't match
    // either branch precisely. Passing through with an `any` cast is the
    // standard approach for proxy-style call constructors.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await publicClient.call(callParams as any);
    returnData = (result.data as Hex) ?? "0x";
    success = true;
  } catch (err) {
    success = false;
    revertReason = extractRevertReason(err, abi);
    errorMsg = revertReason;
  }

  if (abi && dataHex) {
    decodedInput = decodeInput(dataHex as Hex, abi);
  }

  if (success && abi && returnData && decodedInput?.functionName) {
    decodedOutput = decodeOutput(returnData, abi, decodedInput.functionName);
  }

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
