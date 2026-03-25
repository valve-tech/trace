import { Router, type Request, type Response } from "express";
import { lookupSelector, lookupSelectors } from "../services/signatures.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/signatures/:selector — Look up a single 4-byte selector
// ---------------------------------------------------------------------------
router.get("/:selector", async (req: Request, res: Response): Promise<void> => {
  try {
    const selector = String(req.params.selector ?? "");
    if (!/^(0x)?[a-fA-F0-9]{8}$/.test(selector)) {
      res.status(400).json({ ok: false, error: "Invalid selector (must be 4 bytes hex)" });
      return;
    }

    const sigType = req.query.type === "event" ? "event" as const : "function" as const;
    const matches = await lookupSelector(selector, sigType);

    res.json({ ok: true, selector, matches });
  } catch (err) {
    console.error("[signatures] lookup error:", err);
    res.status(500).json({ ok: false, error: "Failed to look up signature" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/signatures/batch — Look up multiple selectors at once
// ---------------------------------------------------------------------------
router.post("/batch", async (req: Request, res: Response): Promise<void> => {
  try {
    const { selectors } = req.body as { selectors?: string[] };
    if (!Array.isArray(selectors) || selectors.length === 0) {
      res.status(400).json({ ok: false, error: "selectors must be a non-empty array" });
      return;
    }
    if (selectors.length > 500) {
      res.status(400).json({ ok: false, error: "Max 500 selectors per batch" });
      return;
    }

    const results = await lookupSelectors(selectors);
    res.json({ ok: true, results });
  } catch (err) {
    console.error("[signatures] batch error:", err);
    res.status(500).json({ ok: false, error: "Failed to look up signatures" });
  }
});

export default router;
