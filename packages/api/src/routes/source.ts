import { Router, type Request, type Response } from "express";
import { getVerifiedSource } from "../services/sourceCode.js";
import { precomputeSourceMap, lookupPc, type SourceLocation } from "../services/sourceMap.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/source/:address — Get verified source code and source map
// ---------------------------------------------------------------------------
router.get("/:address", async (req: Request, res: Response): Promise<void> => {
  try {
    const address = String(req.params.address ?? "");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ ok: false, error: "Invalid address" });
      return;
    }

    const source = await getVerifiedSource(address);
    if (!source) {
      res.status(404).json({
        ok: false,
        error: "Verified source not found",
        hint: "Contract may not be verified on BlockScout or Sourcify",
      });
      return;
    }

    res.json({
      ok: true,
      source: {
        address: source.address,
        chainSource: source.chainSource,
        contractName: source.contractName,
        compilerVersion: source.compilerVersion,
        optimizationUsed: source.optimizationUsed,
        optimizationRuns: source.optimizationRuns,
        files: source.sourceFiles,
        abi: source.abi,
        hasSourceMap: !!source.sourceMap,
        hasDeployedBytecode: !!source.deployedBytecode,
      },
    });
  } catch (err) {
    console.error("[source] fetch error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch source" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/source/:address/map — Map an array of PCs to source locations
//
// Body: { pcs: number[] }
// Returns: { ok, mappings: { [pc]: SourceLocation | null } }
// ---------------------------------------------------------------------------
router.post("/:address/map", async (req: Request, res: Response): Promise<void> => {
  try {
    const address = String(req.params.address ?? "");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ ok: false, error: "Invalid address" });
      return;
    }

    const { pcs } = req.body as { pcs?: number[] };
    if (!Array.isArray(pcs) || pcs.length === 0) {
      res.status(400).json({ ok: false, error: "pcs must be a non-empty array of numbers" });
      return;
    }

    if (pcs.length > 100_000) {
      res.status(400).json({ ok: false, error: "Too many PCs (max 100,000)" });
      return;
    }

    const source = await getVerifiedSource(address);
    if (!source) {
      res.status(404).json({ ok: false, error: "Verified source not found" });
      return;
    }

    if (!source.sourceMap || !source.deployedBytecode) {
      res.status(404).json({
        ok: false,
        error: "Source map not available for this contract",
        hint: "The contract source is verified but the source map was not stored",
      });
      return;
    }

    const precomputed = precomputeSourceMap(
      source.deployedBytecode,
      source.sourceMap,
      source.sourceFiles,
    );

    const mappings: Record<number, SourceLocation | null> = {};
    for (const pc of pcs) {
      mappings[pc] = lookupPc(pc, precomputed);
    }

    res.json({ ok: true, mappings });
  } catch (err) {
    console.error("[source] map error:", err);
    res.status(500).json({ ok: false, error: "Failed to map source" });
  }
});

export default router;
