import type { AbiFunction } from "viem";

/**
 * Pure ABI utilities for TransactionBuilder. The component filters a
 * verified contract's ABI into write/read panes, picks reasonable
 * default strings for each input type, and parses the user's typed
 * strings back into viem-compatible values before calldata encoding.
 *
 * All four functions are pure and string-in/string-out (or
 * unknown-out), so they can be exercised against a small synthetic ABI
 * without mounting React.
 */

/**
 * Filter an ABI down to writeable functions — those that aren't `view`
 * or `pure`. Events, errors, and the constructor are filtered out by
 * the `item.type === "function"` guard.
 */
export function getWriteFunctions(abi: readonly unknown[]): AbiFunction[] {
  return (abi as readonly AbiFunction[]).filter(
    (item) =>
      item.type === "function" &&
      item.stateMutability !== "view" &&
      item.stateMutability !== "pure",
  );
}

/**
 * Filter an ABI down to read-only functions (`view` or `pure`). Mirror
 * of getWriteFunctions; same non-function-item exclusions.
 */
export function getReadFunctions(abi: readonly unknown[]): AbiFunction[] {
  return (abi as readonly AbiFunction[]).filter(
    (item) =>
      item.type === "function" &&
      (item.stateMutability === "view" || item.stateMutability === "pure"),
  );
}

/**
 * A sensible placeholder string for a Solidity input type — the value
 * the form pre-fills when a function is first selected. Returns "" for
 * types the form should leave blank (address, string, untyped fallback).
 *
 * Array check runs FIRST so `uint256[]` gets "[]" rather than "0" —
 * otherwise the form pre-fills a non-array placeholder for an array
 * argument, and encoding fails on submit.
 */
export function getDefaultValue(type: string): string {
  if (type.endsWith("[]")) return "[]";
  if (type.startsWith("uint") || type.startsWith("int")) return "0";
  if (type === "bool") return "false";
  if (type === "address") return "";
  if (type.startsWith("bytes")) return "0x";
  if (type === "string") return "";
  return "";
}

/**
 * Parse a user-typed string into the JS value viem's
 * `encodeFunctionData` expects for a given Solidity type. Integer types
 * go through BigInt (so 256-bit values survive without precision loss);
 * bool is a strict "true" match; array types are JSON-parsed with an
 * empty-array fallback on invalid JSON; everything else (address,
 * string, bytes, tuples) passes through as-is — viem will validate at
 * encode time.
 *
 * Array check runs FIRST so `uint256[]` doesn't get routed through
 * BigInt(value) — that throws on any JSON array literal.
 */
export function parseArgValue(value: string, type: string): unknown {
  if (type.endsWith("[]")) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (type.startsWith("uint") || type.startsWith("int")) return BigInt(value);
  if (type === "bool") return value === "true";
  return value;
}
