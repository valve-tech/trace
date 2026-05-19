import { Router, type Request, type Response } from "express";
import { forkManager } from "../services/forkManager.js";
import { parseEther } from "viem";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";

const router = Router();

/** Extract a route param as a plain string (Express v5 types it as string | string[]). */
function paramStr(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

// ---------------------------------------------------------------------------
// POST /api/testnets — Create a new fork
// ---------------------------------------------------------------------------

router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const { blockNumber, label } = req.body as {
      blockNumber?: number;
      label?: string;
    };

    const fork = await forkManager.createFork({ blockNumber, label });

    respond.ok(res, {
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
  }, "testnets"),
);

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

  respond.ok(res, { forks });
});

// ---------------------------------------------------------------------------
// GET /api/testnets/:id — Get fork details + current block number
// ---------------------------------------------------------------------------

router.get(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const fork = forkManager.getFork(paramStr(req.params.id));
    if (!fork) throw new ApiError(404, "Fork not found");

    let currentBlock: number | null = null;
    try {
      currentBlock = await forkManager.getBlockNumber(fork.id);
    } catch {
      // fork may be unresponsive — surface null currentBlock rather than 500
    }

    respond.ok(res, {
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
  }, "testnets"),
);

// ---------------------------------------------------------------------------
// DELETE /api/testnets/:id — Destroy a fork
// ---------------------------------------------------------------------------

router.delete("/:id", (req: Request, res: Response): void => {
  const destroyed = forkManager.destroyFork(paramStr(req.params.id));
  if (!destroyed) {
    respond.fail(res, new ApiError(404, "Fork not found"));
    return;
  }
  respond.ok(res);
});

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/snapshot — Create a snapshot
// ---------------------------------------------------------------------------

router.post(
  "/:id/snapshot",
  asyncRoute(async (req: Request, res: Response) => {
    const snapshotId = await forkManager.snapshot(paramStr(req.params.id));
    respond.ok(res, { snapshotId });
  }, "testnets"),
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/revert — Revert to a snapshot
// ---------------------------------------------------------------------------

router.post(
  "/:id/revert",
  asyncRoute(async (req: Request, res: Response) => {
    const { snapshotId } = req.body as { snapshotId: string };
    if (!snapshotId) {
      throw new ApiError(400, "snapshotId is required");
    }

    const success = await forkManager.revert(
      paramStr(req.params.id),
      snapshotId,
    );
    respond.ok(res, { success });
  }, "testnets"),
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/fund — Fund an address with PLS
// ---------------------------------------------------------------------------

router.post(
  "/:id/fund",
  asyncRoute(async (req: Request, res: Response) => {
    const { address, amount } = req.body as {
      address: string;
      amount: string;
    };

    if (!address) throw new ApiError(400, "address is required");
    if (!amount) throw new ApiError(400, "amount is required");

    // Convert PLS amount to wei hex string
    const amountWei = "0x" + parseEther(amount).toString(16);

    await forkManager.fund(paramStr(req.params.id), address, amountWei);
    respond.ok(res, { address, amountWei });
  }, "testnets"),
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/mine — Mine blocks
// ---------------------------------------------------------------------------

router.post(
  "/:id/mine",
  asyncRoute(async (req: Request, res: Response) => {
    const { count } = req.body as { count: number };
    if (!count || count < 1) {
      throw new ApiError(400, "count must be a positive integer");
    }

    const mined = Math.min(count, 1000);
    await forkManager.mineBlocks(paramStr(req.params.id), mined);
    respond.ok(res, { mined });
  }, "testnets"),
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/time-travel — Advance time
// ---------------------------------------------------------------------------

router.post(
  "/:id/time-travel",
  asyncRoute(async (req: Request, res: Response) => {
    const { seconds } = req.body as { seconds: number };
    if (!seconds || seconds < 1) {
      throw new ApiError(400, "seconds must be a positive integer");
    }

    await forkManager.timeTravel(paramStr(req.params.id), seconds);
    respond.ok(res, { seconds });
  }, "testnets"),
);

// ---------------------------------------------------------------------------
// POST /api/testnets/:id/rpc — Proxy arbitrary JSON-RPC to a fork
// ---------------------------------------------------------------------------

router.post(
  "/:id/rpc",
  asyncRoute(async (req: Request, res: Response) => {
    const { method, params } = req.body as {
      method: string;
      params?: unknown[];
    };

    if (!method) throw new ApiError(400, "method is required");

    const result = await forkManager.proxyRpc(
      paramStr(req.params.id),
      method,
      params ?? [],
    );
    res.json({ jsonrpc: "2.0", id: req.body.id ?? 1, result });
  }, "testnets"),
);

export default router;
