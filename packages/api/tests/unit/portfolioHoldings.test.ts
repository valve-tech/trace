import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getHoldings } from "../../src/services/portfolio/holdings.js";
import { TRANSFER_TOPIC } from "../../src/services/portfolio/transforms.js";
import { invalidateChifraCache } from "../../src/services/chifra/index.js";

/**
 * Service-level tests for getHoldings with an injected fake chifra client —
 * no daemon, no network. Exercises the discover → balances → native pipeline,
 * the failure contracts (null vs. best-effort native), and the TTL cache.
 */

const HOLDER = "0x9cd83be15a79646a3d22b81fc8ddf7b7240a62cb";
const TOKEN_A = "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39";
const TOKEN_B = "0xa1077a294dde1b09bb078844df40758a5d0f9a27";
const OTHER = "0x1111111111111111111111111111111111111111";

function topic(addr: string): string {
  return "0x" + "000000000000000000000000" + addr.slice(2).toLowerCase();
}
function transferLog(token: string, from: string, to: string) {
  return { address: token, topics: [TRANSFER_TOPIC, topic(from), topic(to)] };
}

interface FakeOpts {
  logs?: unknown[];
  tokenRows?: unknown[];
  nativeBalance?: string;
  throwOn?: "logs" | "tokens" | "state";
}

interface Counts {
  logs: number;
  tokens: number;
  state: number;
}

function makeClient(opts: FakeOpts): { client: Parameters<typeof getHoldings>[2]; counts: Counts } {
  const counts: Counts = { logs: 0, tokens: 0, state: 0 };
  const client = {
    export: {
      logs: async () => {
        counts.logs++;
        if (opts.throwOn === "logs") throw new Error("daemon down");
        return { data: opts.logs ?? [] };
      },
    },
    tokens: async () => {
      counts.tokens++;
      if (opts.throwOn === "tokens") throw new Error("daemon down");
      return { data: opts.tokenRows ?? [] };
    },
    state: async () => {
      counts.state++;
      if (opts.throwOn === "state") throw new Error("daemon down");
      return { data: [{ balance: opts.nativeBalance ?? "0" }] };
    },
  };
  return { client: client as unknown as Parameters<typeof getHoldings>[2], counts };
}

beforeEach(() => invalidateChifraCache());

describe("getHoldings — happy path", () => {
  it("discovers tokens, fetches balances, and returns native", async () => {
    const { client } = makeClient({
      logs: [transferLog(TOKEN_A, OTHER, HOLDER), transferLog(TOKEN_B, HOLDER, OTHER)],
      tokenRows: [
        { address: TOKEN_A, holder: HOLDER, balance: "3000000000000000000", decimals: 18, symbol: "AAA" },
        { address: TOKEN_B, holder: HOLDER, balance: "1000000", decimals: 6, symbol: "BBB" },
      ],
      nativeBalance: "40309098012917841226718",
    });

    const result = await getHoldings(HOLDER, 369, client);
    assert.ok(result);
    assert.equal(result!.chainId, 369);
    assert.equal(result!.address, HOLDER);
    assert.equal(result!.discoveredTokens, 2);
    assert.equal(result!.truncated, false);
    assert.equal(result!.holdings.length, 2);
    // sorted desc by formatted balance: AAA=3 > BBB=1
    assert.equal(result!.holdings[0]!.symbol, "AAA");
    assert.equal(result!.holdings[0]!.balanceFormatted, "3");
    assert.equal(result!.native.symbol, "PLS");
    assert.equal(result!.native.balanceFormatted, "40309.098012917841226718");
  });

  it("drops zero-balance token rows", async () => {
    const { client } = makeClient({
      logs: [transferLog(TOKEN_A, OTHER, HOLDER), transferLog(TOKEN_B, OTHER, HOLDER)],
      tokenRows: [
        { address: TOKEN_A, holder: HOLDER, balance: "5", decimals: 0, symbol: "AAA" },
        { address: TOKEN_B, holder: HOLDER, balance: "0", decimals: 18, symbol: "BBB" },
      ],
    });
    const result = await getHoldings(HOLDER, 369, client);
    assert.equal(result!.holdings.length, 1);
    assert.equal(result!.holdings[0]!.symbol, "AAA");
  });
});

describe("getHoldings — empty + native symbol per chain", () => {
  it("returns empty holdings (no tokens call) when discovery finds nothing", async () => {
    const { client, counts } = makeClient({ logs: [], nativeBalance: "0" });
    const result = await getHoldings(HOLDER, 1, client);
    assert.equal(result!.holdings.length, 0);
    assert.equal(result!.discoveredTokens, 0);
    assert.equal(counts.tokens, 0, "tokens call should be skipped when no tokens discovered");
    assert.equal(result!.native.symbol, "ETH"); // chain 1 native symbol from registry
  });
});

describe("getHoldings — failure contracts", () => {
  it("returns null when discovery (export.logs) fails", async () => {
    const { client } = makeClient({ throwOn: "logs" });
    assert.equal(await getHoldings(HOLDER, 369, client), null);
  });

  it("returns null when the balance (tokens) call fails", async () => {
    const { client } = makeClient({
      logs: [transferLog(TOKEN_A, OTHER, HOLDER)],
      throwOn: "tokens",
    });
    assert.equal(await getHoldings(HOLDER, 369, client), null);
  });

  it("native failure is non-fatal — holdings still return, native is zero", async () => {
    const { client } = makeClient({
      logs: [transferLog(TOKEN_A, OTHER, HOLDER)],
      tokenRows: [{ address: TOKEN_A, holder: HOLDER, balance: "7", decimals: 0 }],
      throwOn: "state",
    });
    const result = await getHoldings(HOLDER, 369, client);
    assert.ok(result);
    assert.equal(result!.holdings.length, 1);
    assert.equal(result!.native.balanceFormatted, "0");
  });
});

describe("getHoldings — cache", () => {
  it("serves the second call from cache without re-hitting the daemon", async () => {
    const { client, counts } = makeClient({
      logs: [transferLog(TOKEN_A, OTHER, HOLDER)],
      tokenRows: [{ address: TOKEN_A, holder: HOLDER, balance: "9", decimals: 0 }],
    });
    await getHoldings(HOLDER, 369, client);
    await getHoldings(HOLDER, 369, client);
    assert.equal(counts.logs, 1, "discovery should run once");
    assert.equal(counts.tokens, 1, "balances should run once");
  });
});
