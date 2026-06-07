/**
 * Etherscan-shaped module/action dispatcher.
 *
 * Incoming requests look like:
 *
 *   GET  /api?module=contract&action=getsourcecode&address=0x...
 *   POST /api   body: { module: "contract", action: "verifysourcecode", ... }
 *
 * We accept both GET and POST regardless of action (Etherscan does too
 * for backward compatibility), and merge `req.query` with `req.body` so
 * tools that send everything in query strings on POST still work. Body
 * wins on collisions because some clients explicitly override query
 * params in the body for write actions.
 *
 * To add a new action: register it in `handlers[module][action]`. Each
 * handler receives the merged params map plus the resolved per-request
 * `ChainConfig` and returns an Etherscan envelope — no Express coupling,
 * no res.json calls inline. This keeps the dispatcher trivial and lets
 * handlers be tested as pure functions.
 *
 * The chain comes from a `chainid` param resolved once at this boundary
 * (see ./chain.ts). Requests that omit it default to PulseChain (369),
 * preserving the legacy single-chain behavior exactly; unsupported or
 * malformed ids are rejected here with an Etherscan error envelope.
 */

import type { Request, Response } from "express";
import type { ChainConfig } from "../../services/chains/registry.js";
import type { EtherscanResponse, JsonRpcResponse } from "./envelope.js";
import { etherscanErr } from "./envelope.js";
import { resolveChain } from "./chain.js";
import {
  checkVerifyStatusAction,
  getAbiAction,
  getSourceCodeAction,
  verifySourceCodeAction,
} from "./handlers/contract.js";
import {
  balanceAction,
  balanceMultiAction,
  tokenTxAction,
  txListAction,
} from "./handlers/account.js";
import {
  getStatusAction,
  getTxReceiptStatusAction,
} from "./handlers/transaction.js";
import {
  getBlockCountdownAction,
  getBlockNoByTimeAction,
  getBlockRewardAction,
} from "./handlers/block.js";
import { proxyActions } from "./handlers/proxy.js";

/**
 * Handlers may return either the standard Etherscan `{status, message,
 * result}` envelope OR a JSON-RPC 2.0 envelope. The `proxy` module uses
 * the latter; everything else uses the former. The dispatcher is shape-
 * agnostic — it just forwards whatever the handler returned.
 */
type Handler = (
  params: Record<string, unknown>,
  chain: ChainConfig,
) => Promise<EtherscanResponse | JsonRpcResponse>;

const handlers: Record<string, Record<string, Handler>> = {
  contract: {
    getsourcecode: getSourceCodeAction,
    getabi: getAbiAction,
    verifysourcecode: verifySourceCodeAction,
    checkverifystatus: checkVerifyStatusAction,
  },
  account: {
    balance: balanceAction,
    balancemulti: balanceMultiAction,
    txlist: txListAction,
    tokentx: tokenTxAction,
  },
  transaction: {
    getstatus: getStatusAction,
    gettxreceiptstatus: getTxReceiptStatusAction,
  },
  block: {
    getblockreward: getBlockRewardAction,
    getblockcountdown: getBlockCountdownAction,
    getblocknobytime: getBlockNoByTimeAction,
  },
  proxy: proxyActions,
};

function mergeParams(req: Request): Record<string, unknown> {
  // `req.body` is `{}` on GET when express.json() ran; safe to spread.
  return { ...req.query, ...(req.body ?? {}) } as Record<string, unknown>;
}

export async function handleEtherscan(
  req: Request,
  res: Response,
): Promise<void> {
  const params = mergeParams(req);
  const module = String(params.module ?? "");
  const action = String(params.action ?? "");

  if (!module || !action) {
    res.json(etherscanErr("Missing module or action"));
    return;
  }

  const handler = handlers[module]?.[action];
  if (!handler) {
    res.json(etherscanErr(`Unsupported action: ${module}.${action}`));
    return;
  }

  // Resolve the target chain once, before dispatching. Bad `chainid` is a
  // client error and short-circuits with the Etherscan error envelope so
  // handlers only ever see a valid, supported ChainConfig.
  const resolved = resolveChain(params);
  if (!resolved.ok) {
    res.json(resolved.error);
    return;
  }

  const result = await handler(params, resolved.chain);
  res.json(result);
}
