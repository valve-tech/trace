import type { BundleTxEntry } from "../../types";

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function createEmptyTx(): BundleTxEntry {
  return {
    id: generateId(),
    from: "",
    to: "",
    value: "",
    data: "",
    gasLimit: "8000000",
  };
}
