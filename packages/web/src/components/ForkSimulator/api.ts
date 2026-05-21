import type { ForkSimulationResponse } from "../../api/simulate";

export async function forkSimulateApi(params: {
  from: string;
  to: string;
  value?: string;
  data?: string;
  blockNumber?: number;
}): Promise<ForkSimulationResponse> {
  const res = await fetch("/api/simulate/fork", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await res.json()) as ForkSimulationResponse;
}

export async function simulateFromHashApi(
  txHash: string,
): Promise<ForkSimulationResponse> {
  const res = await fetch("/api/simulate/from-hash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txHash }),
  });
  return (await res.json()) as ForkSimulationResponse;
}
