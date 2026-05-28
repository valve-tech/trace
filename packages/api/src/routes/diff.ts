import { Router, type Request, type Response } from "express";
import {
  getVerifiedSource,
  UpstreamError,
  type SourceFile,
} from "../services/sourceCode.js";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import type { DiffSummary, FileDiff } from "./diff/types.js";
import {
  compareFiles,
  fileAddedDiff,
  fileRemovedDiff,
} from "./diff/fileDiff.js";

const router = Router();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function requireAddress(raw: unknown, label: string): string {
  if (typeof raw !== "string" || !ADDRESS_RE.test(raw)) {
    throw new ApiError(400, `${label} must be a valid 0x address`);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Route: POST /api/diff
// ---------------------------------------------------------------------------

router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const body = req.body as { addressA?: unknown; addressB?: unknown };
    const addressA = requireAddress(body.addressA, "addressA");
    const addressB = requireAddress(body.addressB, "addressB");

    if (addressA.toLowerCase() === addressB.toLowerCase()) {
      throw new ApiError(400, "addressA and addressB must be different");
    }

    // allSettled so one upstream outage on one address doesn't blow up the
    // whole diff request; we surface 503 only when BOTH sides errored.
    const [resA, resB] = await Promise.allSettled([
      getVerifiedSource(addressA),
      getVerifiedSource(addressB),
    ]);
    const errA = resA.status === "rejected" && resA.reason instanceof UpstreamError ? resA.reason : null;
    const errB = resB.status === "rejected" && resB.reason instanceof UpstreamError ? resB.reason : null;
    if (errA && errB) {
      throw new ApiError(503, "Verification source temporarily unavailable", {
        hint: `${errA.upstream} and ${errB.upstream} both failed; retry shortly`,
      });
    }
    if (resA.status === "rejected" && !errA) throw resA.reason;
    if (resB.status === "rejected" && !errB) throw resB.reason;
    const sourceA = resA.status === "fulfilled" ? resA.value : null;
    const sourceB = resB.status === "fulfilled" ? resB.value : null;

    if (!sourceA && !sourceB) {
      throw new ApiError(404, "Neither contract has verified source code");
    }
    if (!sourceA) {
      throw new ApiError(
        404,
        `No verified source found for contract A (${addressA})`,
      );
    }
    if (!sourceB) {
      throw new ApiError(
        404,
        `No verified source found for contract B (${addressB})`,
      );
    }

    const filesA = new Map<string, SourceFile>(
      sourceA.sourceFiles.map((f) => [f.name, f]),
    );
    const filesB = new Map<string, SourceFile>(
      sourceB.sourceFiles.map((f) => [f.name, f]),
    );

    const allFilenames = new Set([...filesA.keys(), ...filesB.keys()]);
    const fileDiffs: FileDiff[] = [];

    for (const filename of allFilenames) {
      const fa = filesA.get(filename);
      const fb = filesB.get(filename);

      if (fa && fb) {
        const diff = compareFiles(fa, fb);
        if (diff.linesAdded > 0 || diff.linesRemoved > 0) {
          fileDiffs.push(diff);
        }
      } else if (!fa && fb) {
        fileDiffs.push(fileAddedDiff(fb));
      } else if (fa && !fb) {
        fileDiffs.push(fileRemovedDiff(fa));
      }
    }

    const summary: DiffSummary = {
      filesChanged: fileDiffs.filter((f) => f.status === "changed").length,
      filesAdded: fileDiffs.filter((f) => f.status === "added").length,
      filesRemoved: fileDiffs.filter((f) => f.status === "removed").length,
      totalLinesAdded: fileDiffs.reduce((sum, f) => sum + f.linesAdded, 0),
      totalLinesRemoved: fileDiffs.reduce(
        (sum, f) => sum + f.linesRemoved,
        0,
      ),
    };

    respond.ok(res, {
      diff: {
        contractA: { address: sourceA.address, name: sourceA.contractName },
        contractB: { address: sourceB.address, name: sourceB.contractName },
        files: fileDiffs,
        summary,
      },
    });
  }, "diff"),
);

export default router;
