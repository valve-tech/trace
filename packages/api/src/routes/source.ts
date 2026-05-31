import { Router, type Request, type Response } from "express";
import { getVerifiedSource, UpstreamError } from "../services/sourceCode.js";
import {
  precomputeSourceMap,
  lookupPc,
  type SourceLocation,
} from "../services/sourceMap.js";
import { compileForSourceMap } from "../services/solcCompiler.js";
import { analyzeContract } from "../services/slither.js";
import { publicClient } from "../services/rpc.js";
import {
  decompileWithHeimdall,
  heimdallAvailable,
} from "../services/decompiler/heimdall.js";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import { mapPcsSchema, analyzeSchema } from "./source/schemas.js";

const router = Router();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function requireAddress(raw: string | string[] | undefined): string {
  const address = String(raw ?? "");
  if (!ADDRESS_RE.test(address)) throw new ApiError(400, "Invalid address");
  return address;
}

// ---------------------------------------------------------------------------
// GET /api/source/:address — Get verified source code and source map
// ---------------------------------------------------------------------------
router.get(
  "/:address",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);

    let source;
    try {
      source = await getVerifiedSource(address);
    } catch (err) {
      if (err instanceof UpstreamError) {
        throw new ApiError(503, "Verification source temporarily unavailable", {
          hint: `${err.upstream} returned an error; the contract may actually be verified — retry shortly`,
        });
      }
      throw err;
    }
    if (!source) {
      throw new ApiError(404, "Verified source not found", {
        hint: "Contract may not be verified on BlockScout or Sourcify",
      });
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
        // Recompilation is best-effort — warn and continue with whatever
        // BlockScout/Sourcify already gave us.
        console.warn(
          `[source] recompilation failed for ${address}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    respond.ok(res, {
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
  }, "source"),
);

// ---------------------------------------------------------------------------
// POST /api/source/:address/map — Map an array of PCs to source locations
//
// Body: { pcs: number[] }
// Returns: { ok, mappings: { [pc]: SourceLocation | null } }
// ---------------------------------------------------------------------------
router.post(
  "/:address/map",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);

    const { pcs } = mapPcsSchema.parse(req.body);

    let source;
    try {
      source = await getVerifiedSource(address);
    } catch (err) {
      if (err instanceof UpstreamError) {
        throw new ApiError(503, "Verification source temporarily unavailable", {
          hint: `${err.upstream} returned an error; retry shortly`,
        });
      }
      throw err;
    }
    if (!source) throw new ApiError(404, "Verified source not found");

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
      throw new ApiError(
        404,
        "Source map not available — recompilation failed",
        {
          hint: "The contract source is verified but could not be recompiled to generate the source map",
        },
      );
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

    respond.ok(res, { mappings });
  }, "source/map"),
);

// ---------------------------------------------------------------------------
// GET /api/source/:address/storage-layout — Get storage layout
// ---------------------------------------------------------------------------
router.get(
  "/:address/storage-layout",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);

    // Happy path: contract is verified, solc gives us the typed layout.
    const compiled = await compileForSourceMap(address);
    if (compiled?.storageLayout) {
      respond.ok(res, {
        storageLayout: compiled.storageLayout,
        contractName: compiled.contractName,
        source: "compiled",
      });
      return;
    }

    // Fall-through: contract isn't verified (or solc couldn't produce a
    // layout). Try heimdall on the deployed bytecode — gives us inferred
    // slots, names, and access patterns without a verified source.
    const decompiled = await tryDecompileForStorage(address);
    if (decompiled && decompiled.hasLayout) {
      respond.ok(res, {
        decompiled: {
          slots: decompiled.slots,
          pseudoSource: decompiled.pseudoSource,
          inferredAbi: decompiled.inferredAbi,
        },
        source: "decompiled",
      });
      return;
    }

    // Neither path produced a layout. Give a hint that's actually useful.
    const heimdallOn = await heimdallAvailable();
    throw new ApiError(
      404,
      compiled
        ? "Storage layout not available (compiler may be too old)"
        : "Contract isn't verified and the bytecode probe couldn't infer a layout",
      {
        hint: heimdallOn
          ? "Tried solc recompile then heimdall decompile — neither produced storage slots. The bytecode may be a thin proxy or aggressively-optimized to the point of obscuring slot literals."
          : "Heimdall isn't installed on this server, so unverified contracts can't be probed. Install via `bifrost -t nightly` to enable decompiler fall-through.",
      },
    );
  }, "source/storage-layout"),
);

async function tryDecompileForStorage(
  address: string,
): Promise<ReturnType<typeof decompileWithHeimdall> extends Promise<infer T> ? T : never> {
  try {
    const code = await publicClient.getCode({ address: address as `0x${string}` });
    if (!code || code === "0x") return null;
    return await decompileWithHeimdall(code);
  } catch (err) {
    console.warn(`[storage-layout] decompile fall-through failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /api/source/:address/analyze — Run Slither static analysis
// ---------------------------------------------------------------------------
router.post(
  "/:address/analyze",
  asyncRoute(async (req: Request, res: Response) => {
    const address = requireAddress(req.params.address);

    const { skipCache } = analyzeSchema.parse(req.body);

    const result = await analyzeContract(address, {
      skipCache: skipCache === true,
    });

    if (result.error) {
      respond.ok(res, { analysis: result, warning: result.error });
      return;
    }

    respond.ok(res, { analysis: result });
  }, "source/analyze"),
);

export default router;
