export interface AbiItem {
  type: string;
  name?: string;
  inputs?: Array<{ name: string; type: string; components?: unknown[] }>;
  outputs?: Array<{ name: string; type: string }>;
  stateMutability?: string;
  constant?: boolean;
}

export type SubTab = "abi" | "source" | "read" | "write" | "chart";

/**
 * Heuristic: does this ABI look like a token contract? We show the chart tab
 * only for tokens. A `Transfer(address,address,uint256)` event is the
 * strongest single signal — every ERC-20/721 emits it, and it's exactly what
 * the chart consumes.
 */
export function isTokenAbi(abi: AbiItem[]): boolean {
  return abi.some(
    (item) =>
      item.type === "event" &&
      item.name === "Transfer" &&
      (item.inputs?.length ?? 0) >= 3,
  );
}

export function isReadFunction(f: AbiItem): boolean {
  return (
    f.type === "function" &&
    (f.stateMutability === "view" ||
      f.stateMutability === "pure" ||
      Boolean(f.constant))
  );
}

export function isWriteFunction(f: AbiItem): boolean {
  return (
    f.type === "function" &&
    f.stateMutability !== "view" &&
    f.stateMutability !== "pure" &&
    !f.constant
  );
}
