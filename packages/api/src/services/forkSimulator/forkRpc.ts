/**
 * Raw JSON-RPC helper for the simulator's fork. Intentionally not viem —
 * TODO(viem-migration): swap for `createTestClient` to match
 * forkManager.ts after the move-to-200-LOC sweep settles. The simulator
 * uses `eth_sendTransaction` (which viem's testClient does support via
 * walletActions) and the anvil_* methods that viem's testActions already
 * type. Keeping forkRpc for now to keep this split atomic.
 */
export async function forkRpc(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const json = (await res.json()) as {
    result?: unknown;
    error?: { message: string; code: number; data?: string };
  };

  if (json.error) {
    throw new Error(`Fork RPC error: ${json.error.message}`);
  }

  return json.result;
}

/** Single-account state probes against a fork. */
export async function getBalance(
  rpcUrl: string,
  address: string,
): Promise<bigint> {
  const hex = (await forkRpc(rpcUrl, "eth_getBalance", [
    address,
    "latest",
  ])) as string;
  return BigInt(hex);
}

export async function getNonce(
  rpcUrl: string,
  address: string,
): Promise<number> {
  const hex = (await forkRpc(rpcUrl, "eth_getTransactionCount", [
    address,
    "latest",
  ])) as string;
  return Number(hex);
}

export async function getStorageAt(
  rpcUrl: string,
  address: string,
  slot: string,
): Promise<string> {
  return (await forkRpc(rpcUrl, "eth_getStorageAt", [
    address,
    slot,
    "latest",
  ])) as string;
}
