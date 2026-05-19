import type { Address, Hex } from "viem";
import type { Log, TraceFrame } from "@valve-tech/trace-sdk/types";

// ---------------------------------------------------------------------------
// Helpers — encode topics + values the way an EVM node would
// ---------------------------------------------------------------------------

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const UNIV2_SWAP_TOPIC =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

const ALICE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const BOB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const TOKEN = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const POOL = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

function addrTopic(address: Address): Hex {
  return (`0x000000000000000000000000${address.slice(2)}`).toLowerCase() as Hex;
}

function uint256Hex(n: bigint): Hex {
  return (`0x${n.toString(16).padStart(64, "0")}`) as Hex;
}

function transferLog(token: Address, from: Address, to: Address, value: bigint): Log {
  return {
    address: token,
    topics: [TRANSFER_TOPIC as Hex, addrTopic(from), addrTopic(to)],
    data: uint256Hex(value),
  };
}

function approvalLog(token: Address, owner: Address, spender: Address, value: bigint): Log {
  return {
    address: token,
    topics: [APPROVAL_TOPIC as Hex, addrTopic(owner), addrTopic(spender)],
    data: uint256Hex(value),
  };
}

function univ2SwapLog(pool: Address, sender: Address, to: Address): Log {
  return {
    address: pool,
    topics: [UNIV2_SWAP_TOPIC as Hex, addrTopic(sender), addrTopic(to)],
    // amount0In = 1e18, amount1In = 0, amount0Out = 0, amount1Out = 2e18
    data: ("0x" +
      uint256Hex(10n ** 18n).slice(2) +
      uint256Hex(0n).slice(2) +
      uint256Hex(0n).slice(2) +
      uint256Hex(2n * 10n ** 18n).slice(2)) as Hex,
  };
}

// ---------------------------------------------------------------------------
// A synthetic trace exercising every widget in one shot
// ---------------------------------------------------------------------------
// Alice calls a router which:
//   1. Approves the pool to pull her tokens (unlimited — bad practice)
//   2. Pulls 1e18 tokens into the pool (Transfer)
//   3. Pool emits its UniV2 Swap event
//   4. Sends 2e18 of the other token back to Alice (Transfer)
//   5. Performs a DELEGATECALL into an unrecognized implementation
//      (flagged by analyzeRisks unless you whitelist it)
// ---------------------------------------------------------------------------

export const sampleTrace: TraceFrame = {
  type: "CALL",
  from: ALICE,
  to: POOL,
  value: 0n,
  gas: 200_000n,
  gasUsed: 142_318n,
  input: "0x" as Hex,
  output: "0x" as Hex,
  depth: 0,
  children: [
    {
      type: "DELEGATECALL",
      from: POOL,
      to: BOB, // standing in for an unrecognized implementation
      value: 0n,
      gas: 80_000n,
      gasUsed: 12_000n,
      input: "0xabcdef01" as Hex,
      output: "0x" as Hex,
      depth: 1,
      children: [],
    },
  ],
  logs: [
    approvalLog(TOKEN, ALICE, POOL, 2n ** 256n - 1n),
    transferLog(TOKEN, ALICE, POOL, 10n ** 18n),
    univ2SwapLog(POOL, ALICE, ALICE),
    transferLog(TOKEN, POOL, ALICE, 2n * 10n ** 18n),
  ],
};
