export interface AbiItem {
  type: string;
  name?: string;
  inputs?: Array<{ name: string; type: string; components?: unknown[] }>;
  outputs?: Array<{ name: string; type: string }>;
  stateMutability?: string;
  constant?: boolean;
}

export type SubTab = "abi" | "source" | "read" | "write";

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
