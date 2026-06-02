import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WalletClient } from "viem";

/**
 * State-machine tests for useWorkspaceSync. The hook is the orchestrator —
 * it stitches together auth, key derivation, blob pull/push, IDB, and
 * conflict resolution. Each of those layers has its own unit tests; here we
 * pin the lifecycle invariants the UI relies on:
 *
 *   - status transitions through the right intermediate kinds
 *   - cross-tab races never push from a non-in-sync state
 *   - wallet disconnect / address change drops sync to disabled
 *   - 401 from the backend drops to disabled (forces re-auth) rather than
 *     spinning in "error" forever
 *
 * Every dependency module is mocked. The hook reads them via static imports
 * so vi.mock has to be hoisted; we keep one mutable controller object per
 * module so each test can override behaviour locally.
 */

// ---------------------------------------------------------------------------
// Mock setup — vi.mock factories are hoisted above top-level declarations,
// so we collect every controller object inside vi.hoisted() and reference
// them by closure from the factories below.
// ---------------------------------------------------------------------------

const FAKE_SIGNER = {} as WalletClient;

const mocks = vi.hoisted(() => {
  class SyncUnauthorized extends Error {
    constructor() {
      super("unauthorized");
    }
  }

  const walletState: {
    signer: unknown;
    address: `0x${string}` | undefined;
    isConnected: boolean;
  } = { signer: null, address: undefined, isConnected: false };

  const storeState: {
    current: { schemaVersion: 1; workspaces: { id: string; name: string; createdAt: number; updatedAt: number; items: unknown[] }[] };
    persisted: unknown[];
  } = {
    current: { schemaVersion: 1, workspaces: [] },
    persisted: [],
  };

  function mostRecent(store: unknown): number {
    const s = store as { workspaces: { updatedAt: number }[] };
    let max = 0;
    for (const ws of s.workspaces) if (ws.updatedAt > max) max = ws.updatedAt;
    return max;
  }

  return {
    SyncUnauthorized,
    walletState,
    storeState,
    syncClient: {
      authenticate: vi.fn(),
      pullSync: vi.fn(),
      pushSync: vi.fn(),
      apiLogout: vi.fn(),
    },
    syncLib: {
      getWorkspaceKey: vi.fn(),
      encryptStoreEnvelope: vi.fn(async (args: { store: unknown }) => ({
        ciphertext: "cipher",
        nonce: "nonce",
        envelopeFormat: 1 as const,
        keyVersion: 1 as const,
        updatedAt: mostRecent(args.store),
      })),
      decryptStoreEnvelope: vi.fn(),
      resetKeyCache: vi.fn(),
    },
  };
});

vi.mock("../hooks/useWalletSigner", () => ({
  useWalletSigner: () => mocks.walletState,
}));

vi.mock("../lib/workspace/store", () => ({
  loadStore: async () => mocks.storeState.current,
  persistWorkspaces: async (ws: unknown[]) => {
    mocks.storeState.persisted.push(ws);
    mocks.storeState.current = {
      schemaVersion: 1,
      workspaces: ws as typeof mocks.storeState.current.workspaces,
    };
  },
}));

vi.mock("../lib/workspace/sync", () => ({
  getWorkspaceKey: mocks.syncLib.getWorkspaceKey,
  encryptStoreEnvelope: mocks.syncLib.encryptStoreEnvelope,
  decryptStoreEnvelope: mocks.syncLib.decryptStoreEnvelope,
  _resetKeyCacheForTests: mocks.syncLib.resetKeyCache,
}));

vi.mock("../lib/workspace/syncClient", () => ({
  authenticate: mocks.syncClient.authenticate,
  pullSync: mocks.syncClient.pullSync,
  pushSync: mocks.syncClient.pushSync,
  logout: mocks.syncClient.apiLogout,
  SyncUnauthorized: mocks.SyncUnauthorized,
}));

import { useWorkspaceSync } from "../hooks/useWorkspaceSync";

const { walletState, storeState, syncClient, syncLib } = mocks;

// ---------------------------------------------------------------------------
// Wrappers + helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function connectWallet(address: `0x${string}` = "0xabc") {
  walletState.signer = FAKE_SIGNER;
  walletState.address = address;
  walletState.isConnected = true;
}

function disconnectWallet() {
  walletState.signer = null;
  walletState.address = undefined;
  walletState.isConnected = false;
}

function workspaceWith(updatedAt: number) {
  return {
    schemaVersion: 1 as const,
    workspaces: [
      {
        id: "ws1",
        name: "Investigation",
        createdAt: 1,
        updatedAt,
        items: [] as unknown[],
      },
    ],
  };
}

beforeEach(() => {
  disconnectWallet();
  storeState.current = { schemaVersion: 1, workspaces: [] };
  storeState.persisted = [];
  syncClient.authenticate.mockClear();
  syncClient.pullSync.mockReset();
  syncClient.pullSync.mockResolvedValue(null);
  syncClient.pushSync.mockReset();
  syncClient.pushSync.mockResolvedValue({ serverUpdatedAt: 100 });
  syncClient.apiLogout.mockClear();
  syncLib.encryptStoreEnvelope.mockClear();
  syncLib.decryptStoreEnvelope.mockReset();
  syncLib.decryptStoreEnvelope.mockImplementation(async () => storeState.current);
  syncLib.resetKeyCache.mockClear();
});

// ---------------------------------------------------------------------------
// enable()
// ---------------------------------------------------------------------------

describe("useWorkspaceSync — enable() with no wallet", () => {
  it("does not call authenticate when no signer is present", async () => {
    // walletState left at default (disconnected). The hook's lifecycle effect
    // will hold the status at "disabled" — the important invariant is that no
    // network call leaks out before a wallet is connected.
    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });
    expect(syncClient.authenticate).not.toHaveBeenCalled();
    expect(result.current.status.kind).toBe("disabled");
  });

  it("surfaces 'Connect a wallet first' when wagmi says connected but the signer is still loading", async () => {
    // Race between wagmi's `isConnected` flag flipping true and the
    // walletClient hydrating. enable() must not attempt to sign with a null
    // signer; it raises a structured error instead.
    walletState.signer = null;
    walletState.address = "0xabc";
    walletState.isConnected = true;

    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.status).toEqual({
      kind: "error",
      message: "Connect a wallet first",
    });
    expect(syncClient.authenticate).not.toHaveBeenCalled();
  });
});

describe("useWorkspaceSync — enable() first-time (no server blob)", () => {
  it("pushes local store and lands in in-sync with the returned timestamp", async () => {
    connectWallet();
    storeState.current = workspaceWith(50);
    syncClient.pushSync.mockResolvedValue({ serverUpdatedAt: 999 });

    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });

    expect(syncClient.authenticate).toHaveBeenCalledOnce();
    expect(syncClient.pullSync).toHaveBeenCalledOnce();
    expect(syncClient.pushSync).toHaveBeenCalledOnce();
    expect(result.current.status).toEqual({ kind: "in-sync", serverUpdatedAt: 999 });
  });
});

describe("useWorkspaceSync — enable() existing remote, same timestamps", () => {
  it("adopts the remote envelope without prompting a conflict", async () => {
    connectWallet();
    storeState.current = workspaceWith(200);
    syncClient.pullSync.mockResolvedValue({
      ciphertext: "c",
      nonce: "n",
      envelopeFormat: 1,
      keyVersion: 1,
      updatedAt: 200,
      serverUpdatedAt: 555,
    });
    // decryptStoreEnvelope returns whatever the server "had" — for this
    // test it's the same store, simulating a returning user.
    syncLib.decryptStoreEnvelope.mockResolvedValue(workspaceWith(200));

    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });

    expect(syncClient.pushSync).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: "in-sync", serverUpdatedAt: 555 });
    // persistWorkspaces was called — the local store was canonicalised to
    // the server copy even though it was "the same".
    expect(storeState.persisted).toHaveLength(1);
  });
});

describe("useWorkspaceSync — enable() with diverged timestamps", () => {
  it("surfaces a conflict state carrying both stores", async () => {
    connectWallet();
    storeState.current = workspaceWith(100);
    syncClient.pullSync.mockResolvedValue({
      ciphertext: "c",
      nonce: "n",
      envelopeFormat: 1,
      keyVersion: 1,
      updatedAt: 200,
      serverUpdatedAt: 555,
    });
    syncLib.decryptStoreEnvelope.mockResolvedValue(workspaceWith(200));

    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });

    expect(result.current.status.kind).toBe("conflict");
    if (result.current.status.kind === "conflict") {
      expect(result.current.status.local.workspaces[0]!.updatedAt).toBe(100);
      expect(result.current.status.remote.workspaces[0]!.updatedAt).toBe(200);
      expect(result.current.status.remoteServerUpdatedAt).toBe(555);
    }
    expect(syncClient.pushSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pushIfDirty()
// ---------------------------------------------------------------------------

describe("useWorkspaceSync — pushIfDirty()", () => {
  it("is a no-op when status is not in-sync", async () => {
    connectWallet();
    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    // Still in "disabled" — pushIfDirty must NOT call pushSync.
    await act(async () => {
      await result.current.pushIfDirty();
    });
    expect(syncClient.pushSync).not.toHaveBeenCalled();
  });

  it("pushes when local store has advanced past the last server cursor", async () => {
    connectWallet();
    storeState.current = workspaceWith(50);
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 100 });
    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });

    // Advance local clock; subsequent encrypt now sees updatedAt=300.
    storeState.current = workspaceWith(300);
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 350 });

    await act(async () => {
      await result.current.pushIfDirty();
    });

    expect(syncClient.pushSync).toHaveBeenCalledTimes(2); // enable + this one
    expect(result.current.status).toEqual({ kind: "in-sync", serverUpdatedAt: 350 });
  });

  it("skips the network call when local has not advanced", async () => {
    connectWallet();
    storeState.current = workspaceWith(50);
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 100 });
    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });
    syncClient.pushSync.mockClear();

    // Local store unchanged; pushIfDirty should noop.
    await act(async () => {
      await result.current.pushIfDirty();
    });
    expect(syncClient.pushSync).not.toHaveBeenCalled();
    expect(result.current.status.kind).toBe("in-sync");
  });

  it("drops to disabled on SyncUnauthorized so the next enable() re-auths", async () => {
    connectWallet();
    storeState.current = workspaceWith(50);
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 100 });
    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });

    storeState.current = workspaceWith(200);
    syncClient.pushSync.mockRejectedValueOnce(new mocks.SyncUnauthorized());

    await act(async () => {
      await result.current.pushIfDirty();
    });
    expect(result.current.status).toEqual({ kind: "disabled" });
  });
});

// ---------------------------------------------------------------------------
// resolveConflict()
// ---------------------------------------------------------------------------

describe("useWorkspaceSync — resolveConflict()", () => {
  async function getToConflict() {
    connectWallet();
    storeState.current = workspaceWith(100);
    syncClient.pullSync.mockResolvedValue({
      ciphertext: "c",
      nonce: "n",
      envelopeFormat: 1,
      keyVersion: 1,
      updatedAt: 200,
      serverUpdatedAt: 555,
    });
    syncLib.decryptStoreEnvelope.mockResolvedValue(workspaceWith(200));
    const hook = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await hook.result.current.enable();
    });
    expect(hook.result.current.status.kind).toBe("conflict");
    return hook;
  }

  it("'remote' winner replaces the local store with the server copy", async () => {
    const { result } = await getToConflict();
    storeState.persisted = []; // clear pre-conflict adoption noise

    await act(async () => {
      await result.current.resolveConflict("remote");
    });
    expect(result.current.status).toEqual({ kind: "in-sync", serverUpdatedAt: 555 });
    expect(storeState.persisted).toHaveLength(1);
    expect(syncClient.pushSync).not.toHaveBeenCalled(); // remote wins → no upload
  });

  it("'local' winner bumps timestamps past remote, persists, and pushes", async () => {
    const { result } = await getToConflict();
    storeState.persisted = [];
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 777 });

    await act(async () => {
      await result.current.resolveConflict("local");
    });
    expect(result.current.status).toEqual({ kind: "in-sync", serverUpdatedAt: 777 });
    expect(syncClient.pushSync).toHaveBeenCalledOnce();
    // The persisted store should have updatedAt strictly greater than 200
    // (the remote max), so a future conflict detection knows we win.
    const persistedWorkspaces = storeState.persisted[0] as { updatedAt: number }[];
    expect(persistedWorkspaces[0]!.updatedAt).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// disable() + wallet lifecycle
// ---------------------------------------------------------------------------

describe("useWorkspaceSync — disable() and wallet lifecycle", () => {
  it("disable() logs out and clears the key cache", async () => {
    connectWallet();
    storeState.current = workspaceWith(50);
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 100 });
    const { result } = renderHook(() => useWorkspaceSync(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.enable();
    });

    await act(async () => {
      await result.current.disable();
    });
    expect(syncClient.apiLogout).toHaveBeenCalledOnce();
    expect(syncLib.resetKeyCache).toHaveBeenCalledOnce();
    expect(result.current.status).toEqual({ kind: "disabled" });
  });

  it("wallet disconnect mid-session drops back to disabled", async () => {
    connectWallet();
    storeState.current = workspaceWith(50);
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 100 });
    const { result, rerender } = renderHook(() => useWorkspaceSync(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.status.kind).toBe("in-sync");

    disconnectWallet();
    rerender();
    await waitFor(() => {
      expect(result.current.status).toEqual({ kind: "disabled" });
    });
  });

  it("switching wallets resets sync state", async () => {
    connectWallet("0xaaa");
    storeState.current = workspaceWith(50);
    syncClient.pushSync.mockResolvedValueOnce({ serverUpdatedAt: 100 });
    const { result, rerender } = renderHook(() => useWorkspaceSync(), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.status.kind).toBe("in-sync");

    connectWallet("0xbbb");
    rerender();
    await waitFor(() => {
      expect(result.current.status).toEqual({ kind: "disabled" });
    });
  });
});
