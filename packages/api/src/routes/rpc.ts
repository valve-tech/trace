import { Router, type Request, type Response } from "express";
import {
  handleRpcRequest,
  getSupportedMethods,
  type JsonRpcRequest,
} from "../services/rpcProxy.js";
import { rpcAnalytics } from "../services/rpcAnalytics.js";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";

const router = Router();

// ---------------------------------------------------------------------------
// POST /rpc — Main JSON-RPC endpoint
// Accepts standard JSON-RPC body (single or batch) and routes through proxy.
// This route is mounted at the root level (/rpc), not under /api.
// ---------------------------------------------------------------------------

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as JsonRpcRequest | JsonRpcRequest[];

    // Basic validation
    if (!body || (typeof body !== "object")) {
      res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON-RPC request" },
      });
      return;
    }

    const result = await handleRpcRequest(body);
    res.json(result);
  } catch (err) {
    console.error("[rpc] unhandled error:", err);
    res.status(500).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Internal error" },
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/rpc/stats — Analytics summary
// ---------------------------------------------------------------------------

router.get("/stats", (_req: Request, res: Response): void => {
  const stats = rpcAnalytics.getStats();
  res.json({ ok: true, ...stats });
});

// ---------------------------------------------------------------------------
// GET /api/rpc/methods — List all supported methods with descriptions
// ---------------------------------------------------------------------------

router.get("/methods", (_req: Request, res: Response): void => {
  const methods = getSupportedMethods();
  res.json({ ok: true, methods });
});

// ---------------------------------------------------------------------------
// POST /api/rpc/test — Interactive method tester
// Same as /rpc but wraps response with timing info.
// ---------------------------------------------------------------------------

router.post(
  "/test",
  asyncRoute(async (req: Request, res: Response) => {
    const body = req.body as JsonRpcRequest | JsonRpcRequest[];

    if (!body || typeof body !== "object") {
      throw new ApiError(400, "Invalid JSON-RPC request");
    }

    const start = performance.now();
    const result = await handleRpcRequest(body);
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    respond.ok(res, { latencyMs, response: result });
  }, "rpc/test"),
);

export default router;
