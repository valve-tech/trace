import type { Address, Hex } from "viem";
import type { CallType, RawCallFrame, TraceFrame } from "../src/types.js";

const ALICE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CONTRACT = "0xcccccccccccccccccccccccccccccccccccccccc";
const VAULT = "0xdddddddddddddddddddddddddddddddddddddddd";

export const addrs = {
  ALICE: ALICE as Address,
  BOB: BOB as Address,
  CONTRACT: CONTRACT as Address,
  VAULT: VAULT as Address,
};

/**
 * Sample raw callTracer payload as a real geth/anvil node would emit. Outer
 * CALL from Alice to a contract; the contract makes a STATICCALL to a vault,
 * and a DELEGATECALL that reverts.
 */
export function sampleRawCallFrame(): RawCallFrame {
  return {
    type: "CALL",
    from: ALICE,
    to: CONTRACT,
    value: "0x16345785d8a0000", // 0.1 ETH
    gas: "0x186a0",
    gasUsed: "0xc350",
    input: "0xdeadbeef000000000000000000000000",
    output: "0x",
    calls: [
      {
        type: "STATICCALL",
        from: CONTRACT,
        to: VAULT,
        gas: "0x10000",
        gasUsed: "0x1000",
        input: "0x70a08231",
        output: "0x0000000000000000000000000000000000000000000000000000000000000001",
      },
      {
        type: "DELEGATECALL",
        from: CONTRACT,
        to: BOB,
        gas: "0x10000",
        gasUsed: "0x800",
        input: "0xabcdef01",
        output: "0x",
        error: "execution reverted",
        revertReason: "insufficient balance",
      },
    ],
  };
}

/**
 * Build a synthetic canonical TraceFrame inline. Convenience for tests that
 * don't need to go through the normalizer.
 */
export function makeFrame(partial: Partial<TraceFrame> & { type?: CallType }): TraceFrame {
  return {
    type: partial.type ?? "CALL",
    from: partial.from ?? (ALICE as Address),
    to: partial.to ?? (CONTRACT as Address),
    value: partial.value ?? 0n,
    gas: partial.gas ?? 100_000n,
    gasUsed: partial.gasUsed ?? 50_000n,
    input: partial.input ?? ("0x" as Hex),
    output: partial.output ?? ("0x" as Hex),
    error: partial.error,
    revertReason: partial.revertReason,
    depth: partial.depth ?? 0,
    children: partial.children ?? [],
    functionName: partial.functionName,
  };
}
