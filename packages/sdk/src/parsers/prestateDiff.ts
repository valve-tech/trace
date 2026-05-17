import type { Address } from "viem";
import type {
  BalanceDelta,
  RawPrestateAccount,
  RawPrestateDiff,
} from "../types.js";

function hexBigInt(hex: string | undefined): bigint {
  if (!hex || hex === "0x") return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

/**
 * Resolve an address's post-state balance given pre and post entries.
 *
 * Three-way semantic:
 *   - `post` entry entirely absent  → 0n (account self-destructed / empty)
 *   - `post.balance` undefined      → unchanged from pre
 *   - `post.balance` defined        → new balance
 */
function resolvePostBalance(
  preBalance: bigint,
  postEntry: RawPrestateAccount | undefined,
): bigint {
  if (postEntry === undefined) return 0n;
  if (postEntry.balance === undefined) return preBalance;
  return hexBigInt(postEntry.balance);
}

/**
 * Compute net ETH balance changes from a prestateTracer diff-mode payload.
 * Returns one `BalanceDelta` per address whose balance changed, sorted by
 * address ascending for deterministic output.
 *
 * `delta` is signed (`postBalance - preBalance`); positive means the address
 * received ETH, negative means it sent. Addresses with `delta === 0n` are
 * filtered out — they may still appear in the input if non-balance fields
 * (nonce, storage) changed, but this parser is balance-only by design.
 *
 * Missing `pre.balance` is treated as zero (account didn't exist before).
 * Missing `post` entry is treated as zero balance (self-destruct or empty
 * account). These two cases cover the wire-format edge cases for new and
 * destroyed accounts.
 */
export function parsePrestateDiff(raw: RawPrestateDiff): BalanceDelta[] {
  const pre = raw.pre ?? {};
  const post = raw.post ?? {};
  const addresses = new Set<string>([...Object.keys(pre), ...Object.keys(post)]);

  const deltas: BalanceDelta[] = [];
  for (const addr of addresses) {
    const preEntry = pre[addr];
    const postEntry = post[addr];

    const preBalance = hexBigInt(preEntry?.balance);
    const postBalance = resolvePostBalance(preBalance, postEntry);
    const delta = postBalance - preBalance;
    if (delta === 0n) continue;

    deltas.push({
      address: addr.toLowerCase() as Address,
      delta,
      preBalance,
      postBalance,
    });
  }

  // Addresses are unique after the Set dedup above, so a strict equality
  // branch in the comparator would be dead code. The 2-branch form below
  // relies on V8's stable sort if two entries ever compared equal.
  deltas.sort((a, b) => (a.address < b.address ? -1 : 1));
  return deltas;
}
