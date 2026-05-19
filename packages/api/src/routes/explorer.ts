import { Router, type Request, type Response } from "express";
import {
  getTransactionDetails,
  getInternalTransactions,
  getTokenTransfers,
  getAddressTransactions,
  getAddressTokens,
  getContractInfo,
  getBlockDetails,
  getAddressBalance,
  isContract,
} from "../services/explorer.js";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";

const router = Router();

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function requireAddress(raw: string | string[] | undefined): string {
  const address = String(raw ?? "");
  if (!ADDRESS_RE.test(address)) throw new ApiError(400, "Invalid address");
  return address;
}

// ---------------------------------------------------------------------------
// GET /api/tx/:hash
// ---------------------------------------------------------------------------

router.get(
  "/tx/:hash",
  asyncRoute(async (req: Request, res: Response) => {
    const hash = String(req.params.hash ?? "");
    if (!HASH_RE.test(hash)) {
      throw new ApiError(400, "Invalid transaction hash");
    }

    const timeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    // RPC can be slow for complex txs — 15s timeout per call
    const [details, internalTxs, tokenTransfers] = await Promise.all([
      timeout(
        getTransactionDetails(hash),
        15_000,
        null as Awaited<ReturnType<typeof getTransactionDetails>> | null,
      ),
      timeout(getInternalTransactions(hash), 10_000, []),
      timeout(getTokenTransfers(hash), 10_000, []),
    ]);

    if (!details) {
      throw new ApiError(
        504,
        "Transaction fetch timed out — PulseChain RPC may be slow",
      );
    }

    respond.ok(res, {
      result: {
        ...details,
        internalTransactions: internalTxs,
        tokenTransfers,
      },
    });
  }, "explorer/tx"),
);

// ---------------------------------------------------------------------------
// GET /api/address/:address/txs
// ---------------------------------------------------------------------------

router.get(
  "/address/:address/txs",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);
    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = Math.min(
      parseInt(String(req.query.limit ?? "25"), 10) || 25,
      100,
    );

    const result = await getAddressTransactions(address, page, limit);
    respond.ok(res, { result });
  }, "explorer/address/txs"),
);

// ---------------------------------------------------------------------------
// GET /api/address/:address/tokens
// ---------------------------------------------------------------------------

router.get(
  "/address/:address/tokens",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);
    const tokens = await getAddressTokens(address);
    respond.ok(res, { result: tokens });
  }, "explorer/address/tokens"),
);

// ---------------------------------------------------------------------------
// GET /api/address/:address (balance + type)
// ---------------------------------------------------------------------------

router.get(
  "/address/:address",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);
    const [balance, isContractAddr] = await Promise.all([
      getAddressBalance(address),
      isContract(address),
    ]);

    respond.ok(res, {
      result: {
        address,
        ...balance,
        isContract: isContractAddr,
      },
    });
  }, "explorer/address"),
);

// ---------------------------------------------------------------------------
// GET /api/contract/:address
// ---------------------------------------------------------------------------

router.get(
  "/contract/:address",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);
    const info = await getContractInfo(address);
    respond.ok(res, { result: info });
  }, "explorer/contract"),
);

// ---------------------------------------------------------------------------
// GET /api/block/:numberOrHash
// ---------------------------------------------------------------------------

router.get(
  "/block/:numberOrHash",
  asyncRoute(async (req: Request, res: Response) => {
    const numberOrHash = String(req.params.numberOrHash ?? "");
    if (!numberOrHash) {
      throw new ApiError(400, "Block number or hash required");
    }

    const block = await getBlockDetails(numberOrHash);
    respond.ok(res, { result: block });
  }, "explorer/block"),
);

export default router;
