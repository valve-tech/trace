import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import {
  createApiKey,
  listApiKeys,
  deleteApiKey,
} from "../services/apiKeys.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});

// ---------------------------------------------------------------------------
// POST /api/keys — Create a new API key
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = createKeySchema.parse(req.body);
    const result = await createApiKey(name);

    res.status(201).json({
      ok: true,
      apiKey: {
        id: result.id,
        name: result.name,
        // plaintext key returned only once — caller must store it
        key: result.key,
        createdAt: result.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ ok: false, error: "Validation error", details: err.errors });
      return;
    }
    console.error("[api-keys] create error:", err);
    res.status(500).json({ ok: false, error: "Failed to create API key" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/keys — List all API keys (hashes excluded)
// ---------------------------------------------------------------------------
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const keys = await listApiKeys();
    res.json({ ok: true, apiKeys: keys });
  } catch (err) {
    console.error("[api-keys] list error:", err);
    res.status(500).json({ ok: false, error: "Failed to list API keys" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/keys/:id — Delete an API key
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid API key ID" });
      return;
    }

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      res.status(404).json({ ok: false, error: "API key not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[api-keys] delete error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete API key" });
  }
});

export default router;
