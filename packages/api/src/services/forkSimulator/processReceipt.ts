import { type Address, type Hex } from "viem";
import { fetchAbi, decodeLogs } from "../decoder.js";
import type {
  ForkSimulationRequest,
  SimulationLog,
} from "./types.js";
import { forkRpc } from "./forkRpc.js";

export interface ReceiptOutcome {
  success: boolean;
  gasUsed: string;
  returnData: string;
  contractAddress?: string;
  logs: SimulationLog[];
  revertReason?: string;
}

interface RawReceipt {
  status: string;
  gasUsed: string;
  contractAddress?: string | null;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

/**
 * After `eth_sendTransaction` succeeds on the fork, mine a block, fetch
 * the receipt, decode logs against the target contract's ABI, and probe
 * return data via `eth_call`. Also extracts a revert reason when the
 * tx failed but no error was raised at send time (some anvil paths only
 * surface the reason when you re-call against the same state).
 *
 * Pulled out of forkSimulate to keep the orchestrator under the 200 LOC
 * ceiling and the receipt-processing concern isolated.
 */
export async function processReceipt(
  rpcUrl: string,
  txHash: string,
  request: ForkSimulationRequest,
  initialSuccess: boolean,
  initialRevertReason: string | undefined,
): Promise<ReceiptOutcome> {
  await forkRpc(rpcUrl, "evm_mine", []);

  const receipt = (await forkRpc(rpcUrl, "eth_getTransactionReceipt", [
    txHash,
  ])) as RawReceipt;

  const success = receipt.status === "0x1";
  const gasUsed = String(Number(receipt.gasUsed));
  const contractAddress = receipt.contractAddress ?? undefined;

  const logs: SimulationLog[] = receipt.logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
  }));

  if (request.to) {
    try {
      const abi = await fetchAbi(request.to);
      if (abi) {
        const decoded = decodeLogs(
          receipt.logs.map((l) => ({
            address: l.address as Address,
            topics: l.topics as [Hex, ...Hex[]],
            data: l.data as Hex,
            blockHash: "0x0" as Hex,
            blockNumber: 0n,
            transactionHash: txHash as Hex,
            transactionIndex: 0,
            logIndex: 0,
            removed: false,
          })),
          abi,
        );
        for (let i = 0; i < logs.length && i < decoded.length; i++) {
          logs[i]!.decoded = decoded[i];
        }
      }
    } catch {
      // ABI decode is best-effort — return raw logs on any failure.
    }
  }

  let returnData = "0x";
  try {
    returnData = (await forkRpc(rpcUrl, "eth_call", [
      { from: request.from, to: request.to, data: request.data ?? "0x" },
      "latest",
    ])) as string;
  } catch {
    // eth_call may fail for state-changing txs — that's fine, we already
    // have the gas + log data we need.
  }

  let revertReason = initialRevertReason;
  if (!success && !revertReason) {
    try {
      await forkRpc(rpcUrl, "eth_call", [
        {
          from: request.from,
          to: request.to,
          data: request.data ?? "0x",
        },
        "latest",
      ]);
    } catch (err) {
      revertReason = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    success: initialSuccess && success,
    gasUsed,
    returnData,
    contractAddress,
    logs,
    revertReason,
  };
}
