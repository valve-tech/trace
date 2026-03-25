import { Router, type Request, type Response } from "express";
import { forkManager } from "../services/forkManager.js";
import { parseEther } from "viem";

const router = Router();

/** Extract a route param as a plain string (Express v5 types it as string | string[]). */
function paramStr(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

// ---------------------------------------------------------------------------
// POST /api/testnets — Create a new fork
// ---------------------------------------------------------------------------

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { blockNumber, label } = req.body as {
      blockNumber?: number;
      label?: string;
    };

    const fork = await forkManager.createFork({ blockNumber, label });

    res.json({
      ok: true,
      fork: {
        id: fork.id,
        port: fork.port,
        rpcUrl: fork.rpcUrl,
        blockNumber: fork.blockNumber,
        label: fork.label,
        createdAt: fork.createdAt.toISOString(),
        pid: fork.pid,
      },
    });
  } catch (err) {
    console.error("[testnets] create fork error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create fork",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/testnets — List all active forks
// ---------------------------------------------------------------------------

router.get("/", (_req: Request, res: Response): void => {
  const forks = forkManager.listForks().map((f) => ({
    id: f.id,
    port: f.port,
    rpcUrl: f.rpcUrl,
    blockNumber: f.blockNumber,
    label: f.label,
    createdAt: f.createdAt.toISOString(),
    pid: f.pid,
  }));

  res.json({ ok: true, forks });
});

// ---------------------------------------------------------------------------
// GET /api/testnets/:id — Get fork details + current block number
// ---------------------------------------------------------------------------

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const fork = forkManager.getFork(paramStr(req.params.id));
    if (!fork) {
      res.status(404).json({ ok: false, error: "Fork not found" });
      return;
    }

    let currentBlock: number | null = null;
    try {
      currentBlock = await forkManager.getBlockNumber(fork.id);
    } catch {
      // fork may be unresponsive
    }

    res.json({
      ok: true,
      fork: {
        id: fork.id,
        port: fork.port,
        rpcUrl: fork.rpcUrl,
        blockNumber: fork.blockNumber,
        label: fork.label,
        createdAt: fork.createdAt.toISOString(),
        pid: fork.pid,
        currentBlock,
      },
    });
  } catch (err) {
    console.error("[testnets] get fork error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Failed to get fork details",
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/testnets/:id — Destroy a fork
// ---------------------------------------------------------------------------

router.delete("/:id", (req: Request, res: Response): void => {
  const destroyed = forkManager.destroyFork(paramStr(req.params.id));
  if (!destroyed) {
    res.status(404).json({ ok: false, error: "Fork not found" });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/snapshot — Create a snapshot
// ---------------------------------------------------------------------------

router.post(
  "/:id/snapshot",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const snapshotId = await forkManager.snapshot(paramStr(req.params.id));
      res.json({ ok: true, snapshotId });
    } catch (err) {
      console.error("[testnets] snapshot error:", err);
      res.status(err instanceof Error && err.message.includes("not found") ? 404 : 500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to create snapshot",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/revert — Revert to a snapshot
// ---------------------------------------------------------------------------

router.post(
  "/:id/revert",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { snapshotId } = req.body as { snapshotId: string };
      if (!snapshotId) {
        res.status(400).json({ ok: false, error: "snapshotId is required" });
        return;
      }

      const success = await forkManager.revert(paramStr(req.params.id), snapshotId);
      res.json({ ok: true, success });
    } catch (err) {
      console.error("[testnets] revert error:", err);
      res.status(err instanceof Error && err.message.includes("not found") ? 404 : 500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to revert snapshot",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/fund — Fund an address with PLS
// ---------------------------------------------------------------------------

router.post(
  "/:id/fund",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { address, amount } = req.body as {
        address: string;
        amount: string;
      };

      if (!address) {
        res.status(400).json({ ok: false, error: "address is required" });
        return;
      }
      if (!amount) {
        res.status(400).json({ ok: false, error: "amount is required" });
        return;
      }

      // Convert PLS amount to wei hex string
      const amountWei = "0x" + parseEther(amount).toString(16);

      await forkManager.fund(paramStr(req.params.id), address, amountWei);
      res.json({ ok: true, address, amountWei });
    } catch (err) {
      console.error("[testnets] fund error:", err);
      res.status(err instanceof Error && err.message.includes("not found") ? 404 : 500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fund address",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/mine — Mine blocks
// ---------------------------------------------------------------------------

router.post(
  "/:id/mine",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { count } = req.body as { count: number };
      if (!count || count < 1) {
        res
          .status(400)
          .json({ ok: false, error: "count must be a positive integer" });
        return;
      }

      await forkManager.mineBlocks(paramStr(req.params.id), Math.min(count, 1000));
      res.json({ ok: true, mined: Math.min(count, 1000) });
    } catch (err) {
      console.error("[testnets] mine error:", err);
      res.status(err instanceof Error && err.message.includes("not found") ? 404 : 500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to mine blocks",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/time-travel — Advance time
// ---------------------------------------------------------------------------

router.post(
  "/:id/time-travel",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { seconds } = req.body as { seconds: number };
      if (!seconds || seconds < 1) {
        res
          .status(400)
          .json({ ok: false, error: "seconds must be a positive integer" });
        return;
      }

      await forkManager.timeTravel(paramStr(req.params.id), seconds);
      res.json({ ok: true, seconds });
    } catch (err) {
      console.error("[testnets] time-travel error:", err);
      res.status(err instanceof Error && err.message.includes("not found") ? 404 : 500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : "Failed to advance time",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/rpc — Proxy arbitrary JSON-RPC to a fork
// ---------------------------------------------------------------------------

router.post(
  "/:id/rpc",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { method, params } = req.body as {
        method: string;
        params?: unknown[];
      };

      if (!method) {
        res.status(400).json({ ok: false, error: "method is required" });
        return;
      }

      const result = await forkManager.proxyRpc(
        paramStr(req.params.id),
        method,
        params ?? [],
      );
      res.json({ jsonrpc: "2.0", id: req.body.id ?? 1, result });
    } catch (err) {
      console.error("[testnets] rpc proxy error:", err);
      res.status(err instanceof Error && err.message.includes("not found") ? 404 : 500).json({
        ok: false,
        error: err instanceof Error ? err.message : "RPC proxy error",
      });
    }
  },
);

export default router;
