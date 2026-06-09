import { describe, it, expect } from "vitest";
import {
  matchAddressActivity,
  matchErc20Transfer,
  shorten,
  type MinimalTx,
} from "../lib/watcher/matchers";
import { formatTokenAmount } from "../lib/format/tokenAmount";
import { renderWatchSummary } from "../lib/watcher/summary";
import {
  buildRule,
  isRuleActionable,
  removeRule,
  setEnabledForWorkspace,
  toggleRule,
} from "../lib/watcher/rules";
import { appendMatches, toMatch } from "../lib/watcher/log";
import { ruleSignature } from "../lib/watcher/engine";
import { ruleLabel, WATCH_LOG_CAP, type WatchRule } from "../lib/watcher/types";

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const TOKEN = "0xccCC000000000000000000000000000000000003"; // mixed case

function tx(over: Partial<MinimalTx>): MinimalTx {
  return { hash: "0xtx", from: A, to: B, value: 0n, ...over };
}

describe("watcher/matchers — shorten", () => {
  it("collapses long hex, leaves short strings", () => {
    expect(shorten(A)).toBe("0xaaaa…0001");
    expect(shorten("0x1234")).toBe("0x1234");
  });
});

describe("watcher/matchers — matchAddressActivity", () => {
  const rule = (over: Partial<WatchRule>): WatchRule =>
    buildRule({
      workspaceId: "w",
      chainId: 369,
      kind: "address_activity",
      address: A,
      ...over,
    });

  it("returns nothing when the rule has no address", () => {
    const bare = { ...rule({}), address: undefined };
    expect(matchAddressActivity([tx({})], bare, 1n)).toEqual([]);
  });

  it("matches outgoing + incoming under direction=both", () => {
    const out = matchAddressActivity(
      [tx({ from: A, to: B, value: 10n ** 18n }), tx({ from: B, to: A })],
      rule({ direction: "both" }),
      42n,
    );
    expect(out).toHaveLength(2);
    expect(renderWatchSummary(out[0]!)).toContain("sent 1 →");
    expect(out[0]!.blockNumber).toBe("42");
    // Native value is carried RAW (wei); decimals applied only at render.
    expect(out[0]!.amount).toEqual({
      raw: (10n ** 18n).toString(),
      decimals: 18,
      symbol: null,
    });
    expect(renderWatchSummary(out[1]!)).toContain("received");
  });

  it("respects direction=out (ignores incoming)", () => {
    const out = matchAddressActivity(
      [tx({ from: B, to: A }), tx({ from: A, to: B })],
      rule({ direction: "out" }),
      1n,
    );
    expect(out).toHaveLength(1);
    expect(renderWatchSummary(out[0]!)).toContain("sent");
  });

  it("respects direction=in (ignores outgoing)", () => {
    const out = matchAddressActivity(
      [tx({ from: A, to: B }), tx({ from: B, to: A })],
      rule({ direction: "in" }),
      1n,
    );
    expect(out).toHaveLength(1);
    expect(renderWatchSummary(out[0]!)).toContain("received");
  });

  it("labels contract creation (to === null)", () => {
    const out = matchAddressActivity(
      [tx({ from: A, to: null })],
      rule({ direction: "out" }),
      1n,
    );
    expect(renderWatchSummary(out[0]!)).toContain("(contract creation)");
  });

  it("calls a self-transfer when from === to === watched", () => {
    const out = matchAddressActivity([tx({ from: A, to: A })], rule({}), 1n);
    expect(renderWatchSummary(out[0]!)).toContain("self-transfer");
  });

  it("is case-insensitive on addresses", () => {
    const out = matchAddressActivity(
      [tx({ from: A.toUpperCase(), to: B })],
      rule({ direction: "out" }),
      1n,
    );
    expect(out).toHaveLength(1);
  });

  it("filters txs below the min-value threshold", () => {
    const half = 5n * 10n ** 17n; // 0.5
    const one = 10n ** 18n; // 1.0
    const out = matchAddressActivity(
      [tx({ from: A, to: B, value: half }), tx({ from: A, to: B, value: one })],
      rule({ minValueWei: one.toString() }), // require >= 1.0
      1n,
    );
    expect(out).toHaveLength(1);
    expect(renderWatchSummary(out[0]!)).toContain("sent 1 ");
  });

  it("treats no threshold as 'any value fires' (incl. zero-value)", () => {
    const out = matchAddressActivity(
      [tx({ from: A, to: B, value: 0n })],
      rule({ direction: "out" }),
      1n,
    );
    expect(out).toHaveLength(1);
  });
});

describe("watcher/matchers — matchErc20Transfer", () => {
  const rule = (over: Partial<WatchRule>): WatchRule =>
    buildRule({
      workspaceId: "w",
      chainId: 369,
      kind: "erc20_transfer",
      contractAddress: TOKEN,
      ...over,
    });

  const log = {
    transactionHash: "0xfeed",
    blockNumber: 7n,
    from: A,
    to: B,
    value: 1234n,
  };

  it("fires for any transfer when no counterparty filter", () => {
    const m = matchErc20Transfer(log, rule({}));
    expect(m).not.toBeNull();
    // No meta → raw value carried through untouched, scale unknown.
    expect(m!.amount).toEqual({ raw: "1234", decimals: null, symbol: null });
    expect(renderWatchSummary(m!)).toContain("1234");
    expect(m!.txHash).toBe("0xfeed");
    expect(m!.blockNumber).toBe("7");
  });

  it("passes when counterparty matches either side", () => {
    expect(matchErc20Transfer(log, rule({ counterparty: A }))).not.toBeNull();
    expect(matchErc20Transfer(log, rule({ counterparty: B }))).not.toBeNull();
  });

  it("filters out transfers not touching the counterparty", () => {
    const other = "0xdddd000000000000000000000000000000000009";
    expect(matchErc20Transfer(log, rule({ counterparty: other }))).toBeNull();
  });

  it("carries raw value + decimals + symbol (rendered as 1.5 USDC)", () => {
    const m = matchErc20Transfer({ ...log, value: 1_500_000n }, rule({}), {
      decimals: 6,
      symbol: "USDC",
    });
    // Storage stays raw; only the render scales it.
    expect(m!.amount).toEqual({ raw: "1500000", decimals: 6, symbol: "USDC" });
    expect(renderWatchSummary(m!)).toContain("1.5 USDC");
  });

  it("scales without a ticker when meta carries no symbol", () => {
    const m = matchErc20Transfer({ ...log, value: 1_500_000n }, rule({}), {
      decimals: 6,
    });
    expect(renderWatchSummary(m!)).toContain("(1.5)");
    expect(renderWatchSummary(m!)).not.toContain("USDC");
  });

  it("leaves decimals null when meta is null or absent (renders raw)", () => {
    const big = { ...log, value: 1_500_000n };
    expect(matchErc20Transfer(big, rule({}), null)!.amount).toEqual({
      raw: "1500000",
      decimals: null,
      symbol: null,
    });
    expect(renderWatchSummary(matchErc20Transfer(big, rule({}), null)!)).toContain(
      "1500000",
    );
    expect(renderWatchSummary(matchErc20Transfer(big, rule({}))!)).toContain(
      "1500000",
    );
  });
});

describe("format/tokenAmount — formatTokenAmount", () => {
  it("returns raw base units when decimals is null", () => {
    expect(formatTokenAmount(1_500_000n, null)).toBe("1500000");
    expect(formatTokenAmount("1500000", null)).toBe("1500000");
  });

  it("scales by decimals, with and without a symbol", () => {
    expect(formatTokenAmount(1_500_000n, 6, "USDC")).toBe("1.5 USDC");
    expect(formatTokenAmount(1_500_000n, 6)).toBe("1.5");
    expect(formatTokenAmount(1_500_000n, 6, null)).toBe("1.5");
    expect(formatTokenAmount(10n ** 18n, 18, "PLS")).toBe("1 PLS");
    // accepts a decimal-string raw too (the WatchAmount storage form)
    expect(formatTokenAmount("1500000", 6, "USDC")).toBe("1.5 USDC");
  });
});

describe("watcher/summary — renderWatchSummary", () => {
  it("slots the scaled amount between lead and trail", () => {
    expect(
      renderWatchSummary({
        lead: "Transfer 0xa → 0xb (",
        amount: { raw: "1500000", decimals: 6, symbol: "USDC" },
        trail: ")",
      }),
    ).toBe("Transfer 0xa → 0xb (1.5 USDC)");
  });

  it("renders raw base units when decimals are unknown", () => {
    expect(
      renderWatchSummary({
        lead: "Transfer (",
        amount: { raw: "1500000", decimals: null, symbol: null },
        trail: ")",
      }),
    ).toBe("Transfer (1500000)");
  });

  it("omits the amount slot and trims when there is no amount", () => {
    expect(
      renderWatchSummary({ lead: "note ", amount: null, trail: "" }),
    ).toBe("note");
  });
});

describe("watcher/rules — buildRule", () => {
  it("normalizes addresses and drops cross-kind fields", () => {
    const r = buildRule({
      workspaceId: "w",
      chainId: 1,
      kind: "address_activity",
      address: A.toUpperCase(),
      contractAddress: TOKEN, // should be dropped for this kind
    });
    expect(r.address).toBe(A.toLowerCase());
    expect(r.contractAddress).toBeUndefined();
    expect(r.direction).toBe("both");
    expect(r.enabled).toBe(true);
  });

  it("normalizes the min-value threshold ('' and '0' → undefined)", () => {
    const base = {
      workspaceId: "w",
      chainId: 1,
      kind: "address_activity" as const,
      address: A,
    };
    expect(buildRule({ ...base, minValueWei: "1000" }).minValueWei).toBe("1000");
    expect(buildRule({ ...base, minValueWei: "0" }).minValueWei).toBeUndefined();
    expect(buildRule({ ...base, minValueWei: "" }).minValueWei).toBeUndefined();
    expect(buildRule(base).minValueWei).toBeUndefined();
  });

  it("changes the rule signature when the threshold changes", () => {
    const a = buildRule({
      workspaceId: "w",
      chainId: 1,
      kind: "address_activity",
      address: A,
    });
    expect(ruleSignature({ ...a, minValueWei: "1000" })).not.toBe(
      ruleSignature(a),
    );
  });

  it("keeps token + counterparty for erc20 rules", () => {
    const r = buildRule({
      workspaceId: "w",
      chainId: 1,
      kind: "erc20_transfer",
      contractAddress: TOKEN,
      counterparty: A,
      address: A, // dropped for this kind
    });
    expect(r.contractAddress).toBe(TOKEN.toLowerCase());
    expect(r.counterparty).toBe(A.toLowerCase());
    expect(r.address).toBeUndefined();
  });
});

describe("watcher/rules — toggle/remove/actionable", () => {
  const r = buildRule({
    workspaceId: "w",
    chainId: 1,
    kind: "address_activity",
    address: A,
  });

  it("toggles enabled by id", () => {
    expect(toggleRule([r], r.id)[0]!.enabled).toBe(false);
    expect(toggleRule([r], "nope")[0]!.enabled).toBe(true);
  });

  it("removes by id", () => {
    expect(removeRule([r], r.id)).toHaveLength(0);
  });

  it("is actionable only with required conditions", () => {
    expect(isRuleActionable(r)).toBe(true);
    expect(isRuleActionable({ ...r, address: undefined })).toBe(false);
    const erc = buildRule({
      workspaceId: "w",
      chainId: 1,
      kind: "erc20_transfer",
    });
    expect(isRuleActionable(erc)).toBe(false);
  });
});

describe("watcher/rules — setEnabledForWorkspace", () => {
  const mk = (workspaceId: string, enabled: boolean): WatchRule => ({
    ...buildRule({ workspaceId, chainId: 1, kind: "address_activity", address: A }),
    enabled,
  });

  it("pauses every rule in the target workspace, leaving others untouched", () => {
    const rules = [mk("w1", true), mk("w1", true), mk("w2", true)];
    const next = setEnabledForWorkspace(rules, "w1", false);
    expect(next.map((r) => r.enabled)).toEqual([false, false, true]);
  });

  it("resumes every rule in the target workspace", () => {
    const rules = [mk("w1", false), mk("w2", false)];
    const next = setEnabledForWorkspace(rules, "w1", true);
    expect(next.map((r) => r.enabled)).toEqual([true, false]);
  });
});

describe("watcher/engine — ruleSignature", () => {
  const base = buildRule({
    workspaceId: "w",
    chainId: 369,
    kind: "address_activity",
    address: A,
    label: "mine",
  });

  it("is stable when only the label changes", () => {
    expect(ruleSignature({ ...base, label: "renamed" })).toBe(
      ruleSignature(base),
    );
  });

  it("changes when a watched condition changes", () => {
    expect(ruleSignature({ ...base, enabled: false })).not.toBe(
      ruleSignature(base),
    );
    expect(ruleSignature({ ...base, address: B })).not.toBe(
      ruleSignature(base),
    );
  });
});

describe("watcher/log — appendMatches + toMatch", () => {
  const rule = buildRule({
    workspaceId: "w",
    chainId: 369,
    kind: "address_activity",
    address: A,
  });

  // Structured matcher payload — `lead` stands in for the distinguishing text.
  const content = (lead: string, txHash: string) => ({
    lead,
    amount: null,
    trail: "",
    txHash,
  });

  it("toMatch stamps rule context + label", () => {
    const m = toMatch(rule, content("hi", "0x1"));
    expect(m.ruleId).toBe(rule.id);
    expect(m.workspaceId).toBe("w");
    expect(m.label).toBe(ruleLabel(rule));
    expect(m.id).toBeTruthy();
    expect(m.at).toBeGreaterThan(0);
  });

  it("prepends fresh matches newest-first", () => {
    const a = toMatch(rule, content("a", "0xa"));
    const b = toMatch(rule, content("b", "0xb"));
    const next = appendMatches([a], [b]);
    expect(next.map((m) => m.lead)).toEqual(["b", "a"]);
  });

  it("dedupes by (ruleId, txHash, parts) and returns same ref on no-op", () => {
    const a = toMatch(rule, content("a", "0xa"));
    const dup = toMatch(rule, content("a", "0xa"));
    const existing = [a];
    expect(appendMatches(existing, [dup])).toBe(existing);
  });

  it("distinguishes same-tx transfers by raw amount", () => {
    const a = toMatch(rule, {
      lead: "Transfer ",
      amount: { raw: "100", decimals: null, symbol: null },
      trail: ")",
      txHash: "0xsame",
    });
    const b = toMatch(rule, {
      lead: "Transfer ",
      amount: { raw: "200", decimals: null, symbol: null },
      trail: ")",
      txHash: "0xsame",
    });
    // Same rule + tx, different raw amount → two distinct events, not a dedupe.
    expect(appendMatches([a], [b])).toHaveLength(2);
  });

  it("caps at WATCH_LOG_CAP", () => {
    const seed = Array.from({ length: WATCH_LOG_CAP }, (_, i) =>
      toMatch(rule, content(`s${i}`, `0x${i}`)),
    );
    const extra = toMatch(rule, content("new", "0xnew"));
    const next = appendMatches(seed, [extra]);
    expect(next).toHaveLength(WATCH_LOG_CAP);
    expect(next[0]!.lead).toBe("new");
  });
});
