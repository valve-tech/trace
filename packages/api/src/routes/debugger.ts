/**
 * Debugger routes.
 *
 * Provides endpoints for transaction tracing and gas profiling.
 */

import { Router, type Request, type Response } from "express";
import {
  traceTransaction,
  traceTransactionOpcodes,
  traceCall,
} from "../services/tracer.js";
import { profileGas, profileOpcodes } from "../services/gasProfiler.js";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function validateHash(hash: string, res: Response): boolean {
  if (!TX_HASH_RE.test(hash)) {
    res.status(400).json({
      ok: false,
      error: "Invalid transaction hash. Must be a 0x-prefixed 64-character hex string.",
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/debug/tx/:hash/trace — Call-tree trace
// ---------------------------------------------------------------------------

router.get("/tx/:hash/trace", async (req: Request, res: Response): Promise<void> => {
  try {
    const hash = req.params.hash as string;
    if (!hash || !validateHash(hash, res)) return;

    const result = await traceTransaction(hash);

    if (!result.trace) {
      const status = result.debugAvailable ? 500 : 503;
      res.status(status).json({
        ok: false,
        error: result.error,
        debugAvailable: result.debugAvailable,
      });
      return;
    }

    res.json({
      ok: true,
      trace: result.trace,
      debugAvailable: result.debugAvailable,
      source: result.debugAvailable ? "debug_traceTransaction" : "blockscout_fallback",
    });
  } catch (err) {
    console.error("[debug/trace] unexpected error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/debug/tx/:hash/opcodes — Opcode-level trace
// ---------------------------------------------------------------------------

router.get("/tx/:hash/opcodes", async (req: Request, res: Response): Promise<void> => {
  try {
    const hash = req.params.hash as string;
    if (!hash || !validateHash(hash, res)) return;

    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string, 10) || 10000),
      50000,
    );

    const result = await traceTransactionOpcodes(hash, limit);

    if (!result.debugAvailable && result.steps.length === 0) {
      res.status(503).json({
        ok: false,
        error: result.error,
        debugAvailable: false,
      });
      return;
    }

    if (result.error && result.steps.length === 0) {
      res.status(500).json({
        ok: false,
        error: result.error,
        debugAvailable: result.debugAvailable,
      });
      return;
    }

    res.json({
      ok: true,
      steps: result.steps,
      gas: result.gas,
      returnValue: result.returnValue,
      debugAvailable: result.debugAvailable,
    });
  } catch (err) {
    console.error("[debug/opcodes] unexpected error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/debug/tx/:hash/gas-profile — Gas profiler data
// ---------------------------------------------------------------------------

router.get("/tx/:hash/gas-profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const hash = req.params.hash as string;
    if (!hash || !validateHash(hash, res)) return;

    // First get the call trace (will fall back to BlockScout if debug unavailable)
    const traceResult = await traceTransaction(hash);

    if (!traceResult.trace) {
      const status = traceResult.debugAvailable ? 500 : 503;
      res.status(status).json({
        ok: false,
        error: traceResult.error ?? "Failed to obtain call trace for gas profiling",
        debugAvailable: traceResult.debugAvailable,
      });
      return;
    }

    // Profile the call trace
    const gasProfile = await profileGas(traceResult.trace);

    // Also try to get opcode-level profiling
    let opcodeProfile = null;
    try {
      const opcodeResult = await traceTransactionOpcodes(hash, 10000);
      if (opcodeResult.steps.length > 0) {
        opcodeProfile = profileOpcodes(opcodeResult.steps);
      }
    } catch {
      // Opcode profiling is optional — don't fail the whole request
    }

    res.json({
      ok: true,
      gasProfile,
      opcodeProfile,
      debugAvailable: true,
    });
  } catch (err) {
    console.error("[debug/gas-profile] unexpected error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/debug/trace — Trace a simulated call
// ---------------------------------------------------------------------------

router.post("/trace", async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, value, data, gas } = req.body as {
      from?: string;
      to?: string;
      value?: string;
      data?: string;
      gas?: string;
    };

    if (!to && !data) {
      res.status(400).json({
        ok: false,
        error: "At least 'to' or 'data' must be provided.",
      });
      return;
    }

    const result = await traceCall({ from, to, value, data, gas });

    if (!result.debugAvailable && !result.trace) {
      res.status(503).json({
        ok: false,
        error: result.error,
        debugAvailable: false,
      });
      return;
    }

    if (result.error && !result.trace) {
      res.status(500).json({
        ok: false,
        error: result.error,
        debugAvailable: result.debugAvailable,
      });
      return;
    }

    // If we got a trace, also produce a gas profile
    let gasProfile = null;
    if (result.trace) {
      gasProfile = await profileGas(result.trace);
    }

    res.json({
      ok: true,
      trace: result.trace,
      gasProfile,
      debugAvailable: result.debugAvailable,
    });
  } catch (err) {
    console.error("[debug/trace-call] unexpected error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

export default router;
