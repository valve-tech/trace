import type { CallFrame, CallTraceResult } from "./types.js";

const BLOCKSCOUT_API =
  process.env.BLOCKSCOUT_API_URL || "https://api.scan.pulsechain.com/api";

interface BlockScoutInternalTx {
  from: string;
  to: string;
  value: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  type: string;
  callType?: string;
  index?: string | number;
  errCode?: string;
  contractAddress?: string;
  isError?: string;
}

/**
 * Final fallback when both debug_ RPC and anvil-fork replay are unavailable:
 * fetch internal transactions from BlockScout and reconstruct a call tree
 * from execution order.
 *
 * Strategy: BlockScout returns internal txs ordered by execution index. We
 * stack-walk — when `itx.from` matches the `to` of a stack node (or `from`
 * for delegatecall) AND that node has enough gas left to satisfy the
 * child, the itx is the child. Otherwise we pop up to find the right
 * parent. The result is an approximation — internal calls that BlockScout
 * doesn't surface (precompiles, some library calls) won't appear, and
 * exact gas accounting can drift — but it's enough to give users a tree
 * view when no other source exists.
 */
export async function traceViaBlockScout(hash: string): Promise<CallTraceResult> {
  try {
    const url = `${BLOCKSCOUT_API}?module=account&action=txlistinternal&txhash=${hash}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return {
        trace: null,
        error: `BlockScout HTTP ${res.status}`,
        debugAvailable: false,
      };
    }

    const json = (await res.json()) as {
      status: string;
      result: BlockScoutInternalTx[] | string;
    };
    if (
      json.status !== "1" ||
      !Array.isArray(json.result) ||
      json.result.length === 0
    ) {
      return {
        trace: null,
        error: "No internal transactions found via BlockScout",
        debugAvailable: false,
      };
    }

    const root = await fetchRootFrame(hash);
    const sorted = [...json.result].sort(
      (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0),
    );

    // Stack-based tree construction. Each stack entry is a CallFrame; a
    // new itx is a child of the deepest entry whose `to` (or `from` for
    // delegatecall) matches itx.from and whose remaining gas can cover it.
    const stack: CallFrame[] = [root];

    for (const itx of sorted) {
      const frame: CallFrame = {
        type: (itx.callType || itx.type || "CALL").toUpperCase(),
        from: itx.from || "",
        to: itx.to || itx.contractAddress || "",
        value: itx.value || "0",
        gas: itx.gas || "0",
        gasUsed: itx.gasUsed || "0",
        input: itx.input || "0x",
        error: itx.errCode || (itx.isError === "1" ? "reverted" : undefined),
        calls: [],
      };

      popToParent(stack, frame);
      const parent = stack[stack.length - 1]!;
      if (!parent.calls) parent.calls = [];
      parent.calls.push(frame);
      stack.push(frame);
    }

    return { trace: root, error: null, debugAvailable: false };
  } catch (err) {
    return {
      trace: null,
      error: `BlockScout fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      debugAvailable: false,
    };
  }
}

async function fetchRootFrame(hash: string): Promise<CallFrame> {
  const txUrl = `${BLOCKSCOUT_API}?module=transaction&action=gettxinfo&txhash=${hash}`;
  let rootFrom = "",
    rootTo = "",
    rootValue = "0",
    rootGas = "0",
    rootGasUsed = "0",
    rootInput = "0x";
  try {
    const txRes = await fetch(txUrl, { signal: AbortSignal.timeout(10_000) });
    if (txRes.ok) {
      const txJson = (await txRes.json()) as {
        status: string;
        result: Record<string, string>;
      };
      if (txJson.status === "1" && txJson.result) {
        rootFrom = txJson.result.from ?? "";
        rootTo = txJson.result.to ?? "";
        rootValue = txJson.result.value ?? "0";
        rootGas = txJson.result.gas ?? "0";
        rootGasUsed = txJson.result.gasUsed ?? "0";
        rootInput = txJson.result.input ?? "0x";
      }
    }
  } catch {
    // Best-effort — root frame fields stay empty if gettxinfo fails.
  }
  return {
    type: "CALL",
    from: rootFrom,
    to: rootTo,
    value: rootValue,
    gas: rootGas,
    gasUsed: rootGasUsed,
    input: rootInput,
    calls: [],
  };
}

function popToParent(stack: CallFrame[], frame: CallFrame): void {
  const itxFrom = frame.from.toLowerCase();
  const itxGas = parseInt(frame.gas) || 0;

  while (stack.length > 1) {
    const top = stack[stack.length - 1]!;
    const topTo = top.to.toLowerCase();
    const topFrom = top.from.toLowerCase();
    const topGas = parseInt(top.gas) || 0;
    const isDelegateCall = top.type === "DELEGATECALL";

    const callerMatch = isDelegateCall
      ? topFrom === itxFrom
      : topTo === itxFrom;

    if (callerMatch && topGas >= itxGas) break;
    stack.pop();
  }
}
