import type { Address, Hex } from "viem";
import type { StateOverrideMap } from "../../types.js";

/**
 * Convert the route's user-facing `StateOverrideMap` (string-keyed, with
 * stringly-typed fields) into the shape viem/geth's `stateOverride` arg
 * wants — an array of `{ address, balance, nonce, code, stateDiff }`
 * entries with BigInt balances and Hex storage values.
 *
 * Returns `undefined` for empty overrides so the simulator can skip the
 * argument entirely (some RPC implementations choke on empty arrays).
 */
export function buildStateOverride(overrides?: StateOverrideMap) {
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

    if (entry.balance !== undefined) item.balance = BigInt(entry.balance);
    if (entry.nonce !== undefined) item.nonce = entry.nonce;
    if (entry.code !== undefined) item.code = entry.code as Hex;
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
