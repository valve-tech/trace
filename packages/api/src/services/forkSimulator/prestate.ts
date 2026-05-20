import { formatEther } from "viem";
import type {
  BalanceChange,
  NonceChange,
  StateDiff,
  StorageChange,
} from "./types.js";
import { forkRpc, getBalance, getNonce, getStorageAt } from "./forkRpc.js";

interface PrestateAccount {
  balance?: string;
  nonce?: number;
  code?: string;
  storage?: Record<string, string>;
}

type PrestateResult = Record<string, PrestateAccount>;

/**
 * Ask anvil for the prestate (state BEFORE the tx executed) for every
 * account the tx touched. Anvil supports `prestateTracer` natively;
 * non-anvil nodes that lack it return an empty result, which makes
 * balance/nonce/storage changes appear as "no change" — the simulator
 * still functions, just without diff data.
 */
async function getPrestateTrace(
  rpcUrl: string,
  txHash: string,
): Promise<PrestateResult> {
  try {
    const result = await forkRpc(rpcUrl, "debug_traceTransaction", [
      txHash,
      { tracer: "prestateTracer" },
    ]);
    return result as PrestateResult;
  } catch {
    return {};
  }
}

/**
 * Walk the prestate output + a post-state probe to produce a structured
 * diff of balance / nonce / storage changes. The address set is the union
 * of (from, to, every account in the prestate) — covers transitively
 * touched contracts the caller didn't explicitly name.
 */
export async function collectStateDiff(
  rpcUrl: string,
  txHash: string,
  from: string,
  to: string,
): Promise<StateDiff> {
  const balanceChanges: BalanceChange[] = [];
  const storageChanges: StorageChange[] = [];
  const nonceChanges: NonceChange[] = [];

  const prestate = await getPrestateTrace(rpcUrl, txHash);

  const addresses = new Set<string>();
  addresses.add(from.toLowerCase());
  if (to) addresses.add(to.toLowerCase());
  for (const addr of Object.keys(prestate)) {
    addresses.add(addr.toLowerCase());
  }

  for (const addr of addresses) {
    const postBalance = await getBalance(rpcUrl, addr);
    // If the account isn't in the prestate it didn't change — treat the
    // post-balance as both before and after.
    const preBalance = prestate[addr]?.balance
      ? BigInt(prestate[addr].balance)
      : postBalance;

    if (postBalance !== preBalance) {
      const delta = postBalance - preBalance;
      balanceChanges.push({
        address: addr,
        before: formatEther(preBalance),
        after: formatEther(postBalance),
        delta: `${delta >= 0n ? "+" : ""}${formatEther(delta)}`,
      });
    }

    const postNonce = await getNonce(rpcUrl, addr);
    const preNonce = prestate[addr]?.nonce ?? postNonce;
    if (postNonce !== preNonce) {
      nonceChanges.push({ address: addr, before: preNonce, after: postNonce });
    }

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
