import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer, type Server } from "node:http";
import { runMigrations } from "./services/migrate.js";
import { checkHealth, pool } from "./services/pool.js";
import { awaitPendingCacheWrites } from "./services/tracer.js";
import { forkManager } from "./services/forkManager.js";
import simulateRouter from "./routes/simulate.js";
import simulateBundleRouter from "./routes/simulateBundle.js";
import explorerRouter from "./routes/explorer.js";
import testnetsRouter from "./routes/testnets.js";
import rpcRouter from "./routes/rpc.js";
import alertsRouter from "./routes/alerts.js";
import debuggerRouter from "./routes/debugger.js";
import actionsRouter from "./routes/actions.js";
import sourceRouter from "./routes/source.js";
import forkSimulateRouter from "./routes/forkSimulate.js";
import signaturesRouter from "./routes/signatures.js";
import apiKeysRouter from "./routes/apiKeys.js";
import diffRouter from "./routes/diff.js";
import { authMiddleware } from "./middleware/auth.js";
import { startMonitor } from "./services/monitor.js";
import { initScheduler } from "./services/actionScheduler.js";
import { initWebSocket } from "./services/wsServer.js";

const app = express();
const PORT = Number(process.env.PORT) || 10100;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// Routes — health and RPC bypass auth
// ---------------------------------------------------------------------------

app.get("/health", async (_req, res) => {
  const dbOk = await checkHealth();
  const status = dbOk ? "ok" : "degraded";
  res.status(dbOk ? 200 : 503).json({ status, chain: "PulseChain", chainId: 369, db: dbOk });
});

app.use("/rpc", rpcRouter);
app.use("/api/rpc", rpcRouter);

// ---------------------------------------------------------------------------
// Auth middleware — applied to all /api/* routes below
// ---------------------------------------------------------------------------

app.use("/api", authMiddleware);

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use("/api/simulate", simulateRouter);
app.use("/api/simulate", forkSimulateRouter);
app.use("/api/simulate-bundle", simulateBundleRouter);
app.use("/api", explorerRouter);
app.use("/api/testnets", testnetsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/debug", debuggerRouter);
app.use("/api/actions", actionsRouter);
app.use("/api/source", sourceRouter);
app.use("/api/signatures", signaturesRouter);
app.use("/api/keys", apiKeysRouter);
app.use("/api/diff", diffRouter);

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[unhandled]", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  },
);

// ---------------------------------------------------------------------------
// Start — run migrations then listen
// ---------------------------------------------------------------------------

/**
 * Drain in-flight work and tear down owned resources, then exit. Sequence:
 *   1. Close the HTTP server (stop accepting new connections; keep existing
 *      ones until they complete or timeout).
 *   2. Await pending trace-cache writes — the tracer batches Postgres
 *      inserts, and a hard kill loses the batch.
 *   3. End the pg Pool — closes idle connections cleanly.
 *   4. Tear down every Anvil fork.
 *
 * The hard cap (FORCE_EXIT_MS) guarantees the process exits even if a
 * step hangs; without it, a stuck pg query would block container restarts.
 * The `shuttingDown` guard makes signal-flood safe — a second SIGTERM
 * during shutdown is ignored rather than re-entering.
 */
const FORCE_EXIT_MS = 15_000;
let shuttingDown = false;

async function gracefulShutdown(server: Server, signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] received ${signal} — draining…`);

  // Belt-and-braces hard timeout: if any step hangs, abort.
  const forceExit = setTimeout(() => {
    console.error(`[shutdown] timed out after ${FORCE_EXIT_MS}ms — forcing exit`);
    process.exit(1);
  }, FORCE_EXIT_MS);
  forceExit.unref();

  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await awaitPendingCacheWrites();
    await pool.end();
    forkManager.cleanupAll();
    console.log("[shutdown] clean exit");
    process.exit(0);
  } catch (err) {
    console.error("[shutdown] error during drain:", err);
    process.exit(1);
  }
}

async function start(): Promise<void> {
  await runMigrations();

  const server = createServer(app);

  // Let the API orchestrate process exit; ForkManager still cleans up its
  // children but no longer races us to `process.exit(0)` on signals.
  forkManager.setExitOnSignal(false);

  server.listen(PORT, () => {
    console.log(`PulseChain Dev Platform API listening on http://localhost:${PORT}`);
    console.log(`  POST /api/simulate            – single transaction simulation`);
    console.log(`  POST /api/simulate-bundle      – bundled transaction simulation`);
    console.log(`  GET  /api/tx/:hash             – transaction details`);
    console.log(`  GET  /api/address/:addr         – address info`);
    console.log(`  POST /api/testnets             – create virtual testnet`);
    console.log(`  POST /rpc                      – JSON-RPC proxy endpoint`);
    console.log(`  CRUD /api/alerts               – monitoring & alert rules`);
    console.log(`  GET  /api/debug/tx/:hash/trace – call tree trace`);
    console.log(`  CRUD /api/actions              – web3 actions`);
    console.log(`  CRUD /api/keys                 – API key management`);
    console.log(`  WS   /ws/alerts                – real-time alert notifications`);
    console.log(`  GET  /health                   – health check`);

    initWebSocket(server);
    startMonitor();
    void initScheduler();
  });

  process.on("SIGTERM", () => void gracefulShutdown(server, "SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown(server, "SIGINT"));
}

start().catch((err) => {
  console.error("[startup] fatal error:", err);
  process.exit(1);
});

export default app;
