import { Router, type Request, type Response } from "express";
import { getVerifiedSource } from "../services/sourceCode.js";
import { precomputeSourceMap, lookupPc, type SourceLocation } from "../services/sourceMap.js";
import { compileForSourceMap } from "../services/solcCompiler.js";
import { analyzeContract } from "../services/slither.js";

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

    // If source map is missing, try recompilation to generate it
    let hasSourceMap = !!source.sourceMap;
    let hasDeployedBytecode = !!source.deployedBytecode;

    if (!hasSourceMap && source.compilerVersion) {
      try {
        const compiled = await compileForSourceMap(address);
        if (compiled) {
          hasSourceMap = true;
          hasDeployedBytecode = true;
        }
      } catch (err) {
        console.warn(`[source] recompilation failed for ${address}:`, err instanceof Error ? err.message : err);
      }
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
        hasSourceMap,
        hasDeployedBytecode,
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

    let sourceMap = source.sourceMap;
    let deployedBytecode = source.deployedBytecode;

    // Try recompilation if source map is missing
    if (!sourceMap || !deployedBytecode) {
      const compiled = await compileForSourceMap(address);
      if (compiled) {
        sourceMap = compiled.sourceMap;
        deployedBytecode = compiled.deployedBytecode;
      }
    }

    if (!sourceMap || !deployedBytecode) {
      res.status(404).json({
        ok: false,
        error: "Source map not available — recompilation failed",
        hint: "The contract source is verified but could not be recompiled to generate the source map",
      });
      return;
    }

    const precomputed = precomputeSourceMap(
      deployedBytecode,
      sourceMap,
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

// ---------------------------------------------------------------------------
// GET /api/source/:address/storage-layout — Get storage layout
// ---------------------------------------------------------------------------
router.get("/:address/storage-layout", async (req: Request, res: Response): Promise<void> => {
  try {
    const address = String(req.params.address ?? "");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ ok: false, error: "Invalid address" });
      return;
    }

    const compiled = await compileForSourceMap(address);
    if (!compiled) {
      res.status(404).json({ ok: false, error: "Could not compile contract to get storage layout" });
      return;
    }

    if (!compiled.storageLayout) {
      res.status(404).json({ ok: false, error: "Storage layout not available (compiler may be too old)" });
      return;
    }

    res.json({ ok: true, storageLayout: compiled.storageLayout, contractName: compiled.contractName });
  } catch (err) {
    console.error("[source] storage-layout error:", err);
    res.status(500).json({ ok: false, error: "Failed to get storage layout" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/source/:address/analyze — Run Slither static analysis
// ---------------------------------------------------------------------------
router.post("/:address/analyze", async (req: Request, res: Response): Promise<void> => {
  try {
    const address = String(req.params.address ?? "");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ ok: false, error: "Invalid address" });
      return;
    }

    const { skipCache } = req.body as { skipCache?: boolean };

    const result = await analyzeContract(address, { skipCache: skipCache === true });

    if (result.error) {
      res.json({ ok: true, analysis: result, warning: result.error });
      return;
    }

    res.json({ ok: true, analysis: result });
  } catch (err) {
    console.error("[source] analyze error:", err);
    res.status(500).json({ ok: false, error: "Failed to analyze contract" });
  }
});

export default router;
