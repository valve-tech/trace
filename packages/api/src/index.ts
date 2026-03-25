import "dotenv/config";
import express from "express";
import cors from "cors";
import { runMigrations } from "./services/migrate.js";
import { checkHealth } from "./services/pool.js";
import simulateRouter from "./routes/simulate.js";
import simulateBundleRouter from "./routes/simulateBundle.js";
import explorerRouter from "./routes/explorer.js";
import testnetsRouter from "./routes/testnets.js";
import rpcRouter from "./routes/rpc.js";
import alertsRouter from "./routes/alerts.js";
import debuggerRouter from "./routes/debugger.js";
import actionsRouter from "./routes/actions.js";
import { startMonitor } from "./services/monitor.js";
import { initScheduler } from "./services/actionScheduler.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", async (_req, res) => {
  const dbOk = await checkHealth();
  const status = dbOk ? "ok" : "degraded";
  res.status(dbOk ? 200 : 503).json({ status, chain: "PulseChain", chainId: 369, db: dbOk });
});

app.use("/api/simulate", simulateRouter);
app.use("/api/simulate-bundle", simulateBundleRouter);
app.use("/api", explorerRouter);
app.use("/api/testnets", testnetsRouter);

app.use("/rpc", rpcRouter);
app.use("/api/rpc", rpcRouter);

app.use("/api/alerts", alertsRouter);
app.use("/api/debug", debuggerRouter);
app.use("/api/actions", actionsRouter);

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

async function start(): Promise<void> {
  await runMigrations();

  app.listen(PORT, () => {
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
    console.log(`  GET  /health                   – health check`);

    startMonitor();
    void initScheduler();
  });
}

start().catch((err) => {
  console.error("[startup] fatal error:", err);
  process.exit(1);
});

export default app;
