import { forkManager, type Fork } from "./forkManager.js";
import { publicClient } from "./rpc.js";
import { fetchAbi, decodeInput, decodeLogs } from "./decoder.js";
import { type Address, type Hex, formatEther } from "viem";
import { ApiError } from "../lib/respond.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForkSimulationRequest {
  from: string;
  to: string;
  value?: string;
  data?: string;
  blockNumber?: number;
  gasLimit?: number;
}

export interface BalanceChange {
  address: string;
  before: string;
  after: string;
  delta: string;
}

export interface StorageChange {
  address: string;
  contractName?: string;
  slot: string;
  before: string;
  after: string;
  decodedName?: string;
}

export interface NonceChange {
  address: string;
  before: number;
  after: number;
}

export interface StateDiff {
  balanceChanges: BalanceChange[];
  storageChanges: StorageChange[];
  nonceChanges: NonceChange[];
}

export interface ForkSimulationResult {
  success: boolean;
  returnData: string;
  gasUsed: string;
  revertReason?: string;
  stateDiff: StateDiff;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    decoded?: unknown;
  }>;
  decodedInput?: unknown;
  blockNumber: number;
  txHash?: string;
  contractAddress?: string;
}

// ---------------------------------------------------------------------------
// RPC helper for fork
// ---------------------------------------------------------------------------

async function forkRpc(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const json = (await res.json()) as {
    result?: unknown;
    error?: { message: string; code: number; data?: string };
  };

  if (json.error) {
    throw new Error(`Fork RPC error: ${json.error.message}`);
  }

  return json.result;
}

// ---------------------------------------------------------------------------
// Balance/nonce/storage capture
// ---------------------------------------------------------------------------

async function getBalance(rpcUrl: string, address: string): Promise<bigint> {
  const hex = (await forkRpc(rpcUrl, "eth_getBalance", [address, "latest"])) as string;
  return BigInt(hex);
}

async function getNonce(rpcUrl: string, address: string): Promise<number> {
  const hex = (await forkRpc(rpcUrl, "eth_getTransactionCount", [address, "latest"])) as string;
  return Number(hex);
}

async function getStorageAt(rpcUrl: string, address: string, slot: string): Promise<string> {
  return (await forkRpc(rpcUrl, "eth_getStorageAt", [address, slot, "latest"])) as string;
}

// ---------------------------------------------------------------------------
// Prestate tracer — gets all accessed accounts and storage slots
// ---------------------------------------------------------------------------

interface PrestateAccount {
  balance?: string;
  nonce?: number;
  code?: string;
  storage?: Record<string, string>;
}

type PrestateResult = Record<string, PrestateAccount>;

async function getPrestateTrace(rpcUrl: string, txHash: string): Promise<PrestateResult> {
  try {
    const result = await forkRpc(rpcUrl, "debug_traceTransaction", [
      txHash,
      { tracer: "prestateTracer" },
    ]);
    return result as PrestateResult;
  } catch {
    // Anvil may not support prestateTracer, fall back to empty
    return {};
  }
}

// ---------------------------------------------------------------------------
// Collect state diff using prestate tracer
// ---------------------------------------------------------------------------

async function collectStateDiff(
  rpcUrl: string,
  txHash: string,
  from: string,
  to: string,
): Promise<StateDiff> {
  const balanceChanges: BalanceChange[] = [];
  const storageChanges: StorageChange[] = [];
  const nonceChanges: NonceChange[] = [];

  // Get the prestate (state BEFORE the tx executed)
  const prestate = await getPrestateTrace(rpcUrl, txHash);

  // Collect all addresses involved
  const addresses = new Set<string>();
  addresses.add(from.toLowerCase());
  if (to) addresses.add(to.toLowerCase());
  for (const addr of Object.keys(prestate)) {
    addresses.add(addr.toLowerCase());
  }

  // Capture post-state for all involved addresses
  for (const addr of addresses) {
    const postBalance = await getBalance(rpcUrl, addr);
    const preBalance = prestate[addr]?.balance
      ? BigInt(prestate[addr].balance)
      : postBalance; // If not in prestate, balance didn't change

    if (postBalance !== preBalance) {
      const delta = postBalance - preBalance;
      balanceChanges.push({
        address: addr,
        before: formatEther(preBalance),
        after: formatEther(postBalance),
        delta: `${delta >= 0n ? "+" : ""}${formatEther(delta)}`,
      });
    }

    // Nonce changes
    const postNonce = await getNonce(rpcUrl, addr);
    const preNonce = prestate[addr]?.nonce ?? postNonce;
    if (postNonce !== preNonce) {
      nonceChanges.push({
        address: addr,
        before: preNonce,
        after: postNonce,
      });
    }

    // Storage changes
    const preStorage = prestate[addr]?.storage ?? {};
    for (const [slot, preValue] of Object.entries(preStorage)) {
      const postValue = await getStorageAt(rpcUrl, addr, slot);
      if (postValue.toLowerCase() !== preValue.toLowerCase()) {
        storageChanges.push({
          address: addr,
          slot,
          before: preValue,
          after: postValue,
        });
      }
    }
  }

  return { balanceChanges, storageChanges, nonceChanges };
}

// ---------------------------------------------------------------------------
// Core simulation function
// ---------------------------------------------------------------------------

/** Maximum concurrent simulation forks */
const MAX_SIM_FORKS = 5;
let activeForks = 0;

export async function forkSimulate(
  request: ForkSimulationRequest,
): Promise<ForkSimulationResult> {
  if (activeForks >= MAX_SIM_FORKS) {
    throw new ApiError(
      429,
      "Too many concurrent simulations. Try again in a moment.",
    );
  }

  activeForks++;
  let fork: Fork | null = null;

  try {
    // Create a temporary fork
    const forkBlock = request.blockNumber ?? undefined;
    fork = await forkManager.createFork({
      blockNumber: forkBlock,
      label: `sim-${Date.now()}`,
    });

    const rpcUrl = fork.rpcUrl;

    // Impersonate the sender so we can send transactions from any address
    await forkRpc(rpcUrl, "anvil_impersonateAccount", [request.from]);

    // Set the sender's balance high enough to cover the transaction
    await forkRpc(rpcUrl, "anvil_setBalance", [
      request.from,
      "0x" + (10n ** 24n).toString(16), // 1M PLS
    ]);

    // Build the tx
    const txParams: Record<string, unknown> = {
      from: request.from,
      to: request.to,
      data: request.data ?? "0x",
    };
    if (request.value) txParams.value = request.value;
    if (request.gasLimit) txParams.gas = "0x" + request.gasLimit.toString(16);

    // Send the transaction on the fork
    let txHash: string;
    let success = true;
    let revertReason: string | undefined;

    try {
      txHash = (await forkRpc(rpcUrl, "eth_sendTransaction", [txParams])) as string;
    } catch (err) {
      // Transaction reverted
      success = false;
      revertReason = err instanceof Error ? err.message : String(err);
      txHash = ""; // No hash for reverted tx
    }

    // If we got a hash, mine the block and get the receipt
    let gasUsed = "0";
    let returnData = "0x";
    let contractAddress: string | undefined;
    const logs: ForkSimulationResult["logs"] = [];

    if (txHash) {
      await forkRpc(rpcUrl, "evm_mine", []);

      const receipt = (await forkRpc(rpcUrl, "eth_getTransactionReceipt", [txHash])) as {
        status: string;
        gasUsed: string;
        contractAddress?: string | null;
        logs: Array<{ address: string; topics: string[]; data: string }>;
      };

      success = receipt.status === "0x1";
      gasUsed = String(Number(receipt.gasUsed));
      contractAddress = receipt.contractAddress ?? undefined;

      for (const log of receipt.logs) {
        logs.push({
          address: log.address,
          topics: log.topics,
          data: log.data,
        });
      }

      // Try to decode logs using the target contract's ABI
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
          // ABI decode is best-effort
        }
      }

      // Get return data via eth_call (replay without state change)
      try {
        returnData = (await forkRpc(rpcUrl, "eth_call", [
          { from: request.from, to: request.to, data: request.data ?? "0x" },
          "latest",
        ])) as string;
      } catch {
        // eth_call may fail for state-changing txs, that's ok
      }

      // If not successful, try to get the revert reason
      if (!success && !revertReason) {
        try {
          await forkRpc(rpcUrl, "eth_call", [txParams, "latest"]);
        } catch (err) {
          revertReason = err instanceof Error ? err.message : String(err);
        }
      }
    }

    // Collect state diffs
    let stateDiff: StateDiff = { balanceChanges: [], storageChanges: [], nonceChanges: [] };
    if (txHash) {
      try {
        stateDiff = await collectStateDiff(rpcUrl, txHash, request.from, request.to);
      } catch (err) {
        console.error("[forkSimulator] state diff collection failed:", err);
      }
    }

    // Decode input
    let decodedInput: unknown;
    if (request.data && request.to) {
      try {
        const abi = await fetchAbi(request.to);
        if (abi) {
          decodedInput = decodeInput(request.data as Hex, abi);
        }
      } catch {
        // decode is best-effort
      }
    }

    return {
      success,
      returnData,
      gasUsed,
      revertReason,
      stateDiff,
      logs,
      decodedInput,
      blockNumber: typeof fork.blockNumber === "number" ? fork.blockNumber : 0,
      txHash: txHash || undefined,
      contractAddress,
    };
  } finally {
    activeForks--;
    if (fork) {
      // Destroy the temp fork after a short delay (allows follow-up debug trace requests)
      setTimeout(() => {
        forkManager.destroyFork(fork!.id);
      }, 60_000);
    }
  }
}

// ---------------------------------------------------------------------------
// Simulate from tx hash
// ---------------------------------------------------------------------------

export async function simulateFromTxHash(txHash: string): Promise<ForkSimulationResult> {
  // Fetch the original transaction
  const tx = await publicClient.getTransaction({ hash: txHash as Hex });

  if (!tx) {
    throw new Error(`Transaction ${txHash} not found`);
  }

  // Re-simulate on a fork at the block before the tx
  const blockNumber = tx.blockNumber ? Number(tx.blockNumber) - 1 : undefined;

  return forkSimulate({
    from: tx.from,
    to: tx.to ?? "0x0000000000000000000000000000000000000000",
    value: tx.value ? "0x" + tx.value.toString(16) : undefined,
    data: tx.input,
    blockNumber,
    gasLimit: Number(tx.gas),
  });
}
