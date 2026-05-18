import type { Address, Hex } from "viem";
import type { Log, Swap, TraceFrame } from "../types.js";
import { walkCallTree } from "../traversal/walkCallTree.js";

/**
 * keccak256("TokenPurchase(address,uint256,uint256)") — Uniswap V1 ETH→token.
 * V1 indexes all three params, so topic count = 4 and data is empty.
 */
const UNIV1_TOKEN_PURCHASE_TOPIC: Hex =
  "0xcd60aa75dea3072fbc07ae6d7d856b5dc5f4eee88854f5b4abf7b680ef8bc50f";

/** keccak256("EthPurchase(address,uint256,uint256)") — Uniswap V1 token→ETH. */
const UNIV1_ETH_PURCHASE_TOPIC: Hex =
  "0x7f4091b46c33e918a0f3aa42307641d17bb67029427a5369e54b353984238705";

/** keccak256("Swap(address,uint256,uint256,uint256,uint256,address)"). */
const UNIV2_SWAP_TOPIC: Hex =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

/**
 * keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)") —
 * Uniswap V3 pool swap event.
 */
const UNIV3_SWAP_TOPIC: Hex =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

const TOPIC_HEX_LENGTH = 66;
const WORD_HEX_CHARS = 64;

/**
 * Read a single 32-byte word as an unsigned bigint, at the given byte offset
 * within `data`'s hex payload. Throws if the data string is too short — the
 * caller is responsible for catching and treating as "unparseable log".
 */
function readUint(data: string, byteOffset: number): bigint {
  const start = 2 + byteOffset * 2;
  const word = data.slice(start, start + WORD_HEX_CHARS);
  if (word.length !== WORD_HEX_CHARS) throw new Error("short data");
  return BigInt("0x" + word);
}

function addressFromTopic(topic: Hex): Address {
  return (`0x${topic.slice(-40)}`).toLowerCase() as Address;
}

function decodeUniV1(log: Log, logIndex: number): Swap | null {
  const t0 = log.topics[0];
  let direction: "buyToken" | "sellToken";
  if (t0 === UNIV1_TOKEN_PURCHASE_TOPIC) {
    direction = "buyToken";
  } else if (t0 === UNIV1_ETH_PURCHASE_TOPIC) {
    direction = "sellToken";
  } else {
    return null;
  }
  if (log.topics[1]!.length !== TOPIC_HEX_LENGTH) return null;
  if (log.topics[2]!.length !== TOPIC_HEX_LENGTH) return null;
  if (log.topics[3]!.length !== TOPIC_HEX_LENGTH) return null;

  let firstAmount: bigint;
  let secondAmount: bigint;
  try {
    firstAmount = BigInt(log.topics[2]!);
    secondAmount = BigInt(log.topics[3]!);
  } catch {
    return null;
  }

  // TokenPurchase: (eth_sold, tokens_bought).
  // EthPurchase:   (tokens_sold, eth_bought).
  const ethAmount = direction === "buyToken" ? firstAmount : secondAmount;
  const tokenAmount = direction === "buyToken" ? secondAmount : firstAmount;

  return {
    variant: "univ1",
    pool: log.address,
    buyer: addressFromTopic(log.topics[1]!),
    direction,
    ethAmount,
    tokenAmount,
    logIndex,
  };
}

function decodeSwap(log: Log, logIndex: number): Swap | null {
  // V1 dispatches first — it has 4 topics and empty data.
  if (log.topics.length === 4) return decodeUniV1(log, logIndex);

  if (log.topics.length !== 3) return null;
  if (log.topics[1]!.length !== TOPIC_HEX_LENGTH) return null;
  if (log.topics[2]!.length !== TOPIC_HEX_LENGTH) return null;

  const sender = addressFromTopic(log.topics[1]!);
  const counterparty = addressFromTopic(log.topics[2]!);

  try {
    if (log.topics[0] === UNIV2_SWAP_TOPIC) {
      return {
        variant: "univ2",
        pool: log.address,
        sender,
        to: counterparty,
        amount0In: readUint(log.data, 0),
        amount1In: readUint(log.data, 32),
        amount0Out: readUint(log.data, 64),
        amount1Out: readUint(log.data, 96),
        logIndex,
      };
    }
    if (log.topics[0] === UNIV3_SWAP_TOPIC) {
      return {
        variant: "univ3",
        pool: log.address,
        sender,
        recipient: counterparty,
        amount0: BigInt.asIntN(256, readUint(log.data, 0)),
        amount1: BigInt.asIntN(256, readUint(log.data, 32)),
        sqrtPriceX96: readUint(log.data, 64),
        liquidity: readUint(log.data, 96),
        tick: Number(BigInt.asIntN(24, readUint(log.data, 128))),
        logIndex,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extract Uniswap V1/V2/V3 swap events from a call trace. Pre-order walk,
 * skipping reverted subtrees. Logs that look like a swap-shape topic count
 * but don't match a known event hash are ignored (their `logIndex` still
 * increments so positions stay consistent with the on-chain receipt log
 * order).
 *
 * Variants are returned in a discriminated union — branch on `variant`.
 * V2-fork pools (SushiSwap, PancakeSwap V1, etc.) emit the same topic and
 * shape as UniV2 so they're decoded transparently. V4 hook-style pools
 * are not yet supported.
 */
export function parseSwaps(root: TraceFrame): Swap[] {
  const swaps: Swap[] = [];
  let logIndex = 0;

  walkCallTree(root, {
    enter(frame) {
      if (frame.error) return "skip";
      if (!frame.logs) return;
      for (const log of frame.logs) {
        const swap = decodeSwap(log, logIndex);
        if (swap) swaps.push(swap);
        logIndex++;
      }
    },
  });

  return swaps;
}
