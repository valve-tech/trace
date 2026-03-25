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

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/tx/:hash
// ---------------------------------------------------------------------------

router.get("/tx/:hash", async (req: Request, res: Response): Promise<void> => {
  try {
    const hash = String(req.params.hash ?? "");

    if (!hash || !hash.match(/^0x[0-9a-fA-F]{64}$/)) {
      res.status(400).json({ ok: false, error: "Invalid transaction hash" });
      return;
    }

    const [details, internalTxs, tokenTransfers] = await Promise.all([
      getTransactionDetails(hash),
      getInternalTransactions(hash),
      getTokenTransfers(hash),
    ]);

    res.json({
      ok: true,
      result: {
        ...details,
        internalTransactions: internalTxs,
        tokenTransfers,
      },
    });
  } catch (err) {
    console.error("[explorer/tx] error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Failed to fetch transaction",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/address/:address/txs
// ---------------------------------------------------------------------------

router.get(
  "/address/:address/txs",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const address = String(req.params.address ?? "");
      const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
      const limit = Math.min(
        parseInt(String(req.query.limit ?? "25"), 10) || 25,
        100,
      );

      if (!address || !address.match(/^0x[0-9a-fA-F]{40}$/)) {
        res.status(400).json({ ok: false, error: "Invalid address" });
        return;
      }

      const result = await getAddressTransactions(address, page, limit);
      res.json({ ok: true, result });
    } catch (err) {
      console.error("[explorer/address/txs] error:", err);
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch address transactions",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/address/:address/tokens
// ---------------------------------------------------------------------------

router.get(
  "/address/:address/tokens",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const address = String(req.params.address ?? "");

      if (!address || !address.match(/^0x[0-9a-fA-F]{40}$/)) {
        res.status(400).json({ ok: false, error: "Invalid address" });
        return;
      }

      const tokens = await getAddressTokens(address);
      res.json({ ok: true, result: tokens });
    } catch (err) {
      console.error("[explorer/address/tokens] error:", err);
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch address tokens",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/address/:address (balance + type)
// ---------------------------------------------------------------------------

router.get(
  "/address/:address",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const address = String(req.params.address ?? "");

      if (!address || !address.match(/^0x[0-9a-fA-F]{40}$/)) {
        res.status(400).json({ ok: false, error: "Invalid address" });
        return;
      }

      const [balance, isContractAddr] = await Promise.all([
        getAddressBalance(address),
        isContract(address),
      ]);

      res.json({
        ok: true,
        result: {
          address,
          ...balance,
          isContract: isContractAddr,
        },
      });
    } catch (err) {
      console.error("[explorer/address] error:", err);
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch address info",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/contract/:address
// ---------------------------------------------------------------------------

router.get(
  "/contract/:address",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const address = String(req.params.address ?? "");

      if (!address || !address.match(/^0x[0-9a-fA-F]{40}$/)) {
        res.status(400).json({ ok: false, error: "Invalid address" });
        return;
      }

      const info = await getContractInfo(address);
      res.json({ ok: true, result: info });
    } catch (err) {
      console.error("[explorer/contract] error:", err);
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch contract info",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/block/:numberOrHash
// ---------------------------------------------------------------------------

router.get(
  "/block/:numberOrHash",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const numberOrHash = String(req.params.numberOrHash ?? "");

      if (!numberOrHash) {
        res
          .status(400)
          .json({ ok: false, error: "Block number or hash required" });
        return;
      }

      const block = await getBlockDetails(numberOrHash);
      res.json({ ok: true, result: block });
    } catch (err) {
      console.error("[explorer/block] error:", err);
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch block details",
      });
    }
  },
);

export default router;
