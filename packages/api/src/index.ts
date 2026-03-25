import "dotenv/config";
import express from "express";
import cors from "cors";
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", chain: "PulseChain", chainId: 369 });
});

app.use("/api/simulate", simulateRouter);
app.use("/api/simulate-bundle", simulateBundleRouter);
app.use("/api", explorerRouter);
app.use("/api/testnets", testnetsRouter);

// RPC proxy: main endpoint at /rpc (root level), management at /api/rpc/*
app.use("/rpc", rpcRouter);
app.use("/api/rpc", rpcRouter);

// Monitoring & Alerts
app.use("/api/alerts", alertsRouter);

// Smart Contract Debugger & Gas Profiler
app.use("/api/debug", debuggerRouter);

// Web3 Actions — Serverless Functions
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
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`PulseChain Simulator API listening on http://localhost:${PORT}`);
  console.log(`  POST /api/simulate          – single transaction simulation`);
  console.log(`  POST /api/simulate-bundle    – bundled transaction simulation`);
  console.log(`  GET  /api/tx/:hash           – transaction details`);
  console.log(`  GET  /api/address/:addr      – address info`);
  console.log(`  GET  /api/address/:addr/txs  – address transactions`);
  console.log(`  GET  /api/address/:addr/tokens – address tokens`);
  console.log(`  GET  /api/contract/:addr     – contract info`);
  console.log(`  GET  /api/block/:num         – block details`);
  console.log(`  POST /api/testnets           – create virtual testnet`);
  console.log(`  GET  /api/testnets           – list active testnets`);
  console.log(`  POST /rpc                    – JSON-RPC proxy endpoint`);
  console.log(`  GET  /api/rpc/stats          – RPC analytics`);
  console.log(`  GET  /api/rpc/methods        – supported RPC methods`);
  console.log(`  POST /api/rpc/test           – RPC tester with timing`);
  console.log(`  CRUD /api/alerts             – monitoring & alert rules`);
  console.log(`  GET  /api/debug/tx/:hash/trace     – call tree trace`);
  console.log(`  GET  /api/debug/tx/:hash/opcodes   – opcode-level trace`);
  console.log(`  GET  /api/debug/tx/:hash/gas-profile – gas profiler`);
  console.log(`  POST /api/debug/trace               – trace simulated call`);
  console.log(`  GET  /health                 – health check`);

  // Start the block monitor for alert matching
  startMonitor();

  // Initialize action scheduler (periodic triggers)
  initScheduler();
  console.log(`  CRUD /api/actions             – web3 actions (serverless functions)`);
  console.log(`  POST /api/actions/:id/test     – test an action`);
  console.log(`  POST /api/actions/webhooks/:id – webhook trigger endpoint`);
});

export default app;
