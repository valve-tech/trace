import { ponder } from "ponder:registry";
import { tokenBalance, tokenMeta } from "ponder:schema";
import { ERC20_ABI } from "../abis/ERC20";
import { CURATED_TOKENS } from "./tokens";

/**
 * Maintain the (holder, token) → balance projection from ERC-20 Transfer
 * events for the curated token set.
 *
 * Balance correctness without indexing from genesis: the first time we see a
 * (holder, token) pair, we SEED its balance by reading `balanceOf` at the
 * event's block (post-state), then accumulate signed deltas on every
 * subsequent transfer. This keeps storage bounded to holders active since
 * START_BLOCK while reporting true balances for them. (Requires an archive
 * RPC for historical `balanceOf` during backfill — the Valve reth fleet is
 * archive; `getHoldings` in the API carries a balanceOf fallback for holders
 * this index never observed.)
 *
 * Zero-address legs (mint `from`=0, burn `to`=0) are skipped as holders.
 */

const ZERO = "0x0000000000000000000000000000000000000000";

const META = new Map(
  CURATED_TOKENS.map((t) => [t.address.toLowerCase(), t] as const),
);

ponder.on("ERC20:Transfer", async ({ event, context }) => {
  const tokenAddr = event.log.address;
  const token = tokenAddr.toLowerCase() as `0x${string}`;
  const block = event.block.number;
  const value = event.args.value as bigint;

  await ensureMeta(context, token);

  await applyDelta(context, tokenAddr, token, event.args.from, -value, block);
  await applyDelta(context, tokenAddr, token, event.args.to, value, block);
});

async function ensureMeta(context: any, token: `0x${string}`): Promise<void> {
  const existing = await context.db.find(tokenMeta, { token });
  if (existing) return;
  const m = META.get(token);
  await context.db.insert(tokenMeta).values({
    token,
    symbol: m?.symbol ?? "",
    name: m?.name ?? "",
    decimals: m?.decimals ?? 18,
  });
}

async function applyDelta(
  context: any,
  tokenAddr: `0x${string}`,
  token: `0x${string}`,
  partyRaw: string,
  delta: bigint,
  block: bigint,
): Promise<void> {
  if (partyRaw.toLowerCase() === ZERO) return;
  const holder = partyRaw.toLowerCase() as `0x${string}`;

  const existing = await context.db.find(tokenBalance, { holder, token });
  if (existing) {
    await context.db
      .update(tokenBalance, { holder, token })
      .set((row: { balance: bigint }) => ({
        balance: row.balance + delta,
        updatedBlock: block,
      }));
    return;
  }

  // First sight — seed from the chain at this block (post-state already
  // includes `delta`, so store it as-is rather than adding the delta again).
  let seeded = delta > 0n ? delta : 0n;
  try {
    seeded = await context.client.readContract({
      abi: ERC20_ABI,
      address: tokenAddr,
      functionName: "balanceOf",
      args: [holder],
      blockNumber: block,
    });
  } catch {
    // Non-archive RPC or transient failure — fall back to the positive delta
    // (best-effort; getHoldings' balanceOf fallback corrects at query time).
  }
  await context.db
    .insert(tokenBalance)
    .values({ holder, token, balance: seeded, updatedBlock: block });
}
