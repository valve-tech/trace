import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchAddressInfo } from "../api/explorer";

/**
 * Tests the Etherscan-migrated `fetchAddressInfo`. The function fires
 * two parallel requests against `/api?module=...&action=...` — one
 * `account.balance`, one `proxy.eth_getCode` — and composes a single
 * AddressInfo. We mock `globalThis.fetch` with a URL-discriminating
 * router so each call gets its own response.
 */

const ADDRESS = "0xdeadbeef00000000000000000000000000000001";

interface FetchRoute {
  matcher: (url: string) => boolean;
  response: Partial<{
    ok: boolean;
    status: number;
    body: unknown;
  }>;
}

function stubFetchRoutes(routes: FetchRoute[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const route = routes.find((r) => r.matcher(url));
    if (!route) {
      throw new Error(`No stub matches ${url}`);
    }
    return {
      ok: route.response.ok ?? true,
      status: route.response.status ?? 200,
      json: async () => route.response.body,
    } as Response;
  });
}

describe("fetchAddressInfo (Etherscan-migrated)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("composes balance + isContract from two parallel actions", async () => {
    stubFetchRoutes([
      {
        matcher: (u) => u.includes("module=account") && u.includes("action=balance"),
        response: {
          body: { status: "1", message: "OK", result: "1000000000000000000" },
        },
      },
      {
        matcher: (u) => u.includes("module=proxy") && u.includes("action=eth_getCode"),
        response: {
          body: { jsonrpc: "2.0", id: 1, result: "0x60806040" },
        },
      },
    ]);

    const info = await fetchAddressInfo(ADDRESS);
    expect(info.address).toBe(ADDRESS);
    expect(info.balance).toBe("1000000000000000000");
    expect(info.balancePLS).toBe("1");
    expect(info.isContract).toBe(true);
  });

  it("treats eth_getCode '0x' as an EOA (not a contract)", async () => {
    stubFetchRoutes([
      {
        matcher: (u) => u.includes("action=balance"),
        response: {
          body: { status: "1", message: "OK", result: "0" },
        },
      },
      {
        matcher: (u) => u.includes("action=eth_getCode"),
        response: {
          body: { jsonrpc: "2.0", id: 1, result: "0x" },
        },
      },
    ]);

    const info = await fetchAddressInfo(ADDRESS);
    expect(info.isContract).toBe(false);
    expect(info.balance).toBe("0");
    expect(info.balancePLS).toBe("0");
  });

  it("throws when either action returns HTTP non-2xx", async () => {
    stubFetchRoutes([
      {
        matcher: (u) => u.includes("action=balance"),
        response: { ok: false, status: 503, body: {} },
      },
      {
        matcher: (u) => u.includes("action=eth_getCode"),
        response: { body: { jsonrpc: "2.0", id: 1, result: "0x" } },
      },
    ]);

    await expect(fetchAddressInfo(ADDRESS)).rejects.toThrow(/HTTP 503/);
  });

  it("throws when balance returns Etherscan status=0", async () => {
    stubFetchRoutes([
      {
        matcher: (u) => u.includes("action=balance"),
        response: {
          body: { status: "0", message: "NOTOK", result: "Invalid Address format" },
        },
      },
      {
        matcher: (u) => u.includes("action=eth_getCode"),
        response: { body: { jsonrpc: "2.0", id: 1, result: "0x" } },
      },
    ]);

    await expect(fetchAddressInfo(ADDRESS)).rejects.toThrow(
      /Invalid Address format/,
    );
  });

  it("throws when eth_getCode returns a JSON-RPC error", async () => {
    stubFetchRoutes([
      {
        matcher: (u) => u.includes("action=balance"),
        response: {
          body: { status: "1", message: "OK", result: "0" },
        },
      },
      {
        matcher: (u) => u.includes("action=eth_getCode"),
        response: {
          body: {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: "upstream node failed" },
          },
        },
      },
    ]);

    await expect(fetchAddressInfo(ADDRESS)).rejects.toThrow(
      /upstream node failed/,
    );
  });

  it("falls back to balancePLS=0 when balance string isn't a valid bigint", async () => {
    stubFetchRoutes([
      {
        matcher: (u) => u.includes("action=balance"),
        response: {
          body: { status: "1", message: "OK", result: "not-a-number" },
        },
      },
      {
        matcher: (u) => u.includes("action=eth_getCode"),
        response: { body: { jsonrpc: "2.0", id: 1, result: "0x" } },
      },
    ]);

    const info = await fetchAddressInfo(ADDRESS);
    expect(info.balancePLS).toBe("0");
  });
});
