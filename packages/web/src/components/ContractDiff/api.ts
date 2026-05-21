import type { DiffResponse } from "./types";

export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function fetchDiff(
  addressA: string,
  addressB: string,
): Promise<DiffResponse> {
  const res = await fetch("/api/diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addressA, addressB }),
  });
  return (await res.json()) as DiffResponse;
}
