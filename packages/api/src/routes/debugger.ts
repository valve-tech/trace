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
import { ApiError, asyncRoute, respond } from "../lib/respond.js";

const router = Router();

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function requireHash(raw: string | string[] | undefined): string {
  const hash = String(raw ?? "");
  if (!TX_HASH_RE.test(hash)) {
    throw new ApiError(
      400,
      "Invalid transaction hash. Must be a 0x-prefixed 64-character hex string.",
    );
  }
  return hash;
}

// ---------------------------------------------------------------------------
// GET /api/debug/tx/:hash/trace — Call-tree trace
// ---------------------------------------------------------------------------

router.get(
  "/tx/:hash/trace",
  asyncRoute(async (req: Request, res: Response) => {
    const hash = requireHash(req.params.hash);
    const result = await traceTransaction(hash);

    if (!result.trace) {
      throw new ApiError(
        result.debugAvailable ? 500 : 503,
        result.error ?? "Failed to obtain call trace",
        { debugAvailable: result.debugAvailable },
      );
    }

    respond.ok(res, {
      trace: result.trace,
      debugAvailable: result.debugAvailable,
      source: result.debugAvailable
        ? "debug_traceTransaction"
        : "blockscout_fallback",
    });
  }, "debug/trace"),
);

// ---------------------------------------------------------------------------
// GET /api/debug/tx/:hash/opcodes — Opcode-level trace
// ---------------------------------------------------------------------------

router.get(
  "/tx/:hash/opcodes",
  asyncRoute(async (req: Request, res: Response) => {
    const hash = requireHash(req.params.hash);
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string, 10) || 10000),
      50000,
    );

    const result = await traceTransactionOpcodes(hash, limit);

    if (!result.debugAvailable && result.steps.length === 0) {
      throw new ApiError(503, result.error ?? "debug RPC unavailable", {
        debugAvailable: false,
      });
    }

    if (result.error && result.steps.length === 0) {
      throw new ApiError(500, result.error, {
        debugAvailable: result.debugAvailable,
      });
    }

    respond.ok(res, {
      steps: result.steps,
      gas: result.gas,
      returnValue: result.returnValue,
      debugAvailable: result.debugAvailable,
    });
  }, "debug/opcodes"),
);

// ---------------------------------------------------------------------------
// GET /api/debug/tx/:hash/gas-profile — Gas profiler data
// ---------------------------------------------------------------------------

router.get(
  "/tx/:hash/gas-profile",
  asyncRoute(async (req: Request, res: Response) => {
    const hash = requireHash(req.params.hash);
    const traceResult = await traceTransaction(hash);

    if (!traceResult.trace) {
      throw new ApiError(
        traceResult.debugAvailable ? 500 : 503,
        traceResult.error ?? "Failed to obtain call trace for gas profiling",
        { debugAvailable: traceResult.debugAvailable },
      );
    }

    const gasProfile = await profileGas(traceResult.trace);

    // Opcode profiling is optional — don't fail the whole request
    let opcodeProfile = null;
    try {
      const opcodeResult = await traceTransactionOpcodes(hash, 10000);
      if (opcodeResult.steps.length > 0) {
        opcodeProfile = profileOpcodes(opcodeResult.steps);
      }
    } catch {
      // intentional swallow
    }

    respond.ok(res, {
      gasProfile,
      opcodeProfile,
      debugAvailable: true,
    });
  }, "debug/gas-profile"),
);

// ---------------------------------------------------------------------------
// POST /api/debug/trace — Trace a simulated call
// ---------------------------------------------------------------------------

router.post(
  "/trace",
  asyncRoute(async (req: Request, res: Response) => {
    const { from, to, value, data, gas } = req.body as {
      from?: string;
      to?: string;
      value?: string;
      data?: string;
      gas?: string;
    };

    if (!to && !data) {
      throw new ApiError(400, "At least 'to' or 'data' must be provided.");
    }

    const result = await traceCall({ from, to, value, data, gas });

    if (!result.debugAvailable && !result.trace) {
      throw new ApiError(503, result.error ?? "debug RPC unavailable", {
        debugAvailable: false,
      });
    }

    if (result.error && !result.trace) {
      throw new ApiError(500, result.error, {
        debugAvailable: result.debugAvailable,
      });
    }

    let gasProfile = null;
    if (result.trace) {
      gasProfile = await profileGas(result.trace);
    }

    respond.ok(res, {
      trace: result.trace,
      gasProfile,
      debugAvailable: result.debugAvailable,
    });
  }, "debug/trace-call"),
);

export default router;
