import { Router, type Request, type Response } from "express";
import { getVerifiedSource, type SourceFile } from "../services/sourceCode.js";

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiffLineType = "context" | "added" | "removed";

interface DiffLine {
  type: DiffLineType;
  /** Line number in file A (null for added lines) */
  lineA: number | null;
  /** Line number in file B (null for removed lines) */
  lineB: number | null;
  content: string;
}

interface FileDiff {
  filename: string;
  /** "changed" | "added" | "removed" — relative to A */
  status: "changed" | "added" | "removed";
  lines: DiffLine[];
  linesAdded: number;
  linesRemoved: number;
}

interface DiffSummary {
  filesChanged: number;
  filesAdded: number;
  filesRemoved: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
}

// ---------------------------------------------------------------------------
// LCS-based unified diff
// ---------------------------------------------------------------------------

/**
 * Compute the longest-common-subsequence table for two line arrays.
 * Returns the LCS length matrix (dimensions: (aLen+1) × (bLen+1)).
 */
function buildLcsTable(aLines: string[], bLines: string[]): number[][] {
  const aLen = aLines.length;
  const bLen = bLines.length;
  // Allocate a (aLen+1) × (bLen+1) table initialised to 0
  const table: number[][] = Array.from({ length: aLen + 1 }, () =>
    new Array<number>(bLen + 1).fill(0),
  );

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      if (aLines[i - 1] === bLines[j - 1]) {
        table[i]![j] = table[i - 1]![j - 1]! + 1;
      } else {
        table[i]![j] = Math.max(table[i - 1]![j]!, table[i]![j - 1]!);
      }
    }
  }
  return table;
}

/**
 * Walk the LCS table back-to-front and emit diff hunks.
 * Returns lines in correct (forward) order.
 */
function diffLines(aLines: string[], bLines: string[]): DiffLine[] {
  const table = buildLcsTable(aLines, bLines);
  const result: DiffLine[] = [];

  let i = aLines.length;
  let j = bLines.length;

  while (i > 0 || j > 0) {
    const aLine = aLines[i - 1];
    const bLine = bLines[j - 1];

    if (i > 0 && j > 0 && aLine === bLine) {
      // Lines match → context
      result.push({ type: "context", lineA: i, lineB: j, content: aLine! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i]![j - 1]! >= table[i - 1]![j]!)) {
      // Line added in B
      result.push({ type: "added", lineA: null, lineB: j, content: bLine! });
      j--;
    } else {
      // Line removed from A
      result.push({ type: "removed", lineA: i, lineB: null, content: aLine! });
      i--;
    }
  }

  result.reverse();
  return result;
}

// ---------------------------------------------------------------------------
// File comparison
// ---------------------------------------------------------------------------

function compareFiles(fileA: SourceFile, fileB: SourceFile): FileDiff {
  const aLines = fileA.content.split("\n");
  const bLines = fileB.content.split("\n");
  const lines = diffLines(aLines, bLines);

  const linesAdded = lines.filter((l) => l.type === "added").length;
  const linesRemoved = lines.filter((l) => l.type === "removed").length;

  return {
    filename: fileA.name,
    status: "changed",
    lines,
    linesAdded,
    linesRemoved,
  };
}

function fileAddedDiff(file: SourceFile): FileDiff {
  const lines = file.content.split("\n").map((content, idx) => ({
    type: "added" as const,
    lineA: null,
    lineB: idx + 1,
    content,
  }));
  return {
    filename: file.name,
    status: "added",
    lines,
    linesAdded: lines.length,
    linesRemoved: 0,
  };
}

function fileRemovedDiff(file: SourceFile): FileDiff {
  const lines = file.content.split("\n").map((content, idx) => ({
    type: "removed" as const,
    lineA: idx + 1,
    lineB: null,
    content,
  }));
  return {
    filename: file.name,
    status: "removed",
    lines,
    linesAdded: 0,
    linesRemoved: lines.length,
  };
}

// ---------------------------------------------------------------------------
// Route: POST /api/diff
// ---------------------------------------------------------------------------

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { addressA, addressB } = req.body as {
      addressA?: unknown;
      addressB?: unknown;
    };

    const addrPattern = /^0x[a-fA-F0-9]{40}$/;

    if (typeof addressA !== "string" || !addrPattern.test(addressA)) {
      res.status(400).json({ ok: false, error: "addressA must be a valid 0x address" });
      return;
    }

    if (typeof addressB !== "string" || !addrPattern.test(addressB)) {
      res.status(400).json({ ok: false, error: "addressB must be a valid 0x address" });
      return;
    }

    if (addressA.toLowerCase() === addressB.toLowerCase()) {
      res.status(400).json({ ok: false, error: "addressA and addressB must be different" });
      return;
    }

    // Fetch both sources in parallel
    const [sourceA, sourceB] = await Promise.all([
      getVerifiedSource(addressA),
      getVerifiedSource(addressB),
    ]);

    if (!sourceA && !sourceB) {
      res.status(404).json({
        ok: false,
        error: "Neither contract has verified source code",
      });
      return;
    }

    if (!sourceA) {
      res.status(404).json({
        ok: false,
        error: `No verified source found for contract A (${addressA})`,
      });
      return;
    }

    if (!sourceB) {
      res.status(404).json({
        ok: false,
        error: `No verified source found for contract B (${addressB})`,
      });
      return;
    }

    // Index files by name
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
        // Both have this file — only include if there are actual changes
        const diff = compareFiles(fa, fb);
        if (diff.linesAdded > 0 || diff.linesRemoved > 0) {
          fileDiffs.push(diff);
        }
      } else if (!fa && fb) {
        // Only in B → added
        fileDiffs.push(fileAddedDiff(fb));
      } else if (fa && !fb) {
        // Only in A → removed
        fileDiffs.push(fileRemovedDiff(fa));
      }
    }

    const summary: DiffSummary = {
      filesChanged: fileDiffs.filter((f) => f.status === "changed").length,
      filesAdded: fileDiffs.filter((f) => f.status === "added").length,
      filesRemoved: fileDiffs.filter((f) => f.status === "removed").length,
      totalLinesAdded: fileDiffs.reduce((sum, f) => sum + f.linesAdded, 0),
      totalLinesRemoved: fileDiffs.reduce((sum, f) => sum + f.linesRemoved, 0),
    };

    res.json({
      ok: true,
      diff: {
        contractA: {
          address: sourceA.address,
          name: sourceA.contractName,
        },
        contractB: {
          address: sourceB.address,
          name: sourceB.contractName,
        },
        files: fileDiffs,
        summary,
      },
    });
  } catch (err) {
    console.error("[diff] error:", err);
    res.status(500).json({ ok: false, error: "Failed to compute diff" });
  }
});

export default router;
