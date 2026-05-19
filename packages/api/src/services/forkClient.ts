import {
  createPublicClient,
  createTestClient,
  http,
  publicActions,
  type PublicActions,
  type TestClient,
} from "viem";

/**
 * A viem TestClient (anvil mode) extended with public actions. Anvil-specific
 * methods (`snapshot`, `revert`, `setBalance`, `setStorageAt`, `mine`,
 * `increaseTime`) come from `testActions`; `getBlockNumber` and arbitrary
 * `request({ method, params })` for raw RPC come from publicActions.
 *
 * One client is cached per fork in `ForkManager.clients` — clients are cheap
 * to construct (no network IO until the first call) but reusing them keeps
 * the transport's retry/timeout state stable across operations.
 */
export type ForkClient = TestClient<"anvil"> & PublicActions;

export function makeForkClient(port: number): ForkClient {
  return createTestClient({
    mode: "anvil",
    transport: http(`http://127.0.0.1:${port}`),
  }).extend(publicActions);
}

/**
 * Probe whether anything is answering JSON-RPC on `port`. Uses a transient
 * publicClient with a short timeout and no retries — designed to be polled.
 * Any successful `getChainId` (anvil returns the forked chain's id) means
 * the port is up.
 */
export async function isPortListening(port: number): Promise<boolean> {
  try {
    const probe = createPublicClient({
      transport: http(`http://127.0.0.1:${port}`, {
        timeout: 1000,
        retryCount: 0,
      }),
    });
    await probe.getChainId();
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll `port` until anvil starts answering, or throw after `timeoutMs`.
 * Anvil typically warms up in well under a second; the default 30s cap is a
 * defensive upper bound that should never be hit in practice.
 */
export async function waitForPort(
  port: number,
  timeoutMs: number = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortListening(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Timed out waiting for anvil to start on port ${port} after ${timeoutMs}ms`,
  );
}
