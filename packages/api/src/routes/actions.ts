import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import {
  createAction,
  getAction,
  listActions,
  updateAction,
  deleteAction,
  getActionLogs,
  getTodayExecutions,
  type ActionRow,
} from "../services/actionsDb.js";
import { executeAction, type TriggerEvent } from "../services/actionExecutor.js";
import {
  registerAction,
  unregisterAction,
} from "../services/actionScheduler.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const triggerTypeEnum = z.enum(["block", "event", "periodic", "webhook"]);

/**
 * Cap user-controlled action code at 64 KB. The vm executor runs whatever
 * lands here; even with proper isolation a multi-MB script would balloon
 * memory and serialization cost. 64 KB is far more than any reasonable
 * snippet needs.
 */
const MAX_CODE_LENGTH = 64 * 1024;

/**
 * Per-key cap on secret values. Keeps a hostile or buggy client from
 * trying to dump GB-scale blobs into Postgres via the secrets JSONB column.
 */
const MAX_SECRET_LENGTH = 4 * 1024;

const secretsSchema = z
  .record(z.string().max(MAX_SECRET_LENGTH, `Secret value exceeds ${MAX_SECRET_LENGTH} chars`))
  .refine((obj) => Object.keys(obj).length <= 32, {
    message: "At most 32 secret keys",
  });

const createActionSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  code: z.string().max(MAX_CODE_LENGTH).optional().default(""),
  triggerType: triggerTypeEnum,
  triggerConfig: z.record(z.unknown()).optional().default({}),
  secrets: secretsSchema.optional().default({}),
});

const updateActionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().max(MAX_CODE_LENGTH).optional(),
  triggerType: triggerTypeEnum.optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  secrets: secretsSchema.optional(),
  enabled: z.boolean().optional(),
});

const testActionSchema = z.object({
  event: z.record(z.unknown()).optional(),
});

const idParamSchema = z.coerce.number().int().positive("Invalid action ID");

/** Send a 400 with consistent error shape for Zod validation failures. */
function sendValidationError(res: Response, err: ZodError): void {
  res.status(400).json({ ok: false, error: "Validation error", details: err.errors });
}

// ---------------------------------------------------------------------------
// POST /api/actions — Create action
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createActionSchema.parse(req.body);
    const action = await createAction({
      name: parsed.name,
      code: parsed.code,
      trigger_type: parsed.triggerType,
      trigger_config: JSON.stringify(parsed.triggerConfig),
      secrets: JSON.stringify(parsed.secrets),
    });

    registerAction(action);

    res.status(201).json({ ok: true, action: formatAction(action) });
  } catch (err: unknown) {
    if (err instanceof ZodError) return sendValidationError(res, err);
    console.error("[actions] create error:", err);
    res.status(500).json({ ok: false, error: "Failed to create action" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/actions — List all actions
// ---------------------------------------------------------------------------
router.get("/", async (_req: Request, res: Response) => {
  try {
    const actions = await listActions();
    const todayExecutions = await getTodayExecutions();
    const enabledCount = actions.filter((a) => a.enabled).length;

    res.json({
      ok: true,
      actions: actions.map(formatAction),
      stats: {
        total: actions.length,
        active: enabledCount,
        todayExecutions,
      },
    });
  } catch (err: unknown) {
    console.error("[actions] list error:", err);
    res.status(500).json({ ok: false, error: "Failed to list actions" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/actions/:id — Get action details
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const action = await getAction(id);
    if (!action) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }
    res.json({ ok: true, action: formatAction(action) });
  } catch (err: unknown) {
    if (err instanceof ZodError) return sendValidationError(res, err);
    console.error("[actions] get error:", err);
    res.status(500).json({ ok: false, error: "Failed to get action" });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/actions/:id — Update action
// ---------------------------------------------------------------------------
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const existing = await getAction(id);
    if (!existing) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    const parsed = updateActionSchema.parse(req.body);

    const updated = await updateAction(id, {
      name: parsed.name ?? existing.name,
      code: parsed.code ?? existing.code,
      trigger_type: parsed.triggerType ?? existing.trigger_type,
      trigger_config: parsed.triggerConfig
        ? JSON.stringify(parsed.triggerConfig)
        : JSON.stringify(existing.trigger_config),
      secrets: parsed.secrets
        ? JSON.stringify(parsed.secrets)
        : JSON.stringify(existing.secrets),
      enabled: parsed.enabled ?? existing.enabled,
    });

    if (!updated) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    unregisterAction(id);
    if (updated.enabled) {
      registerAction(updated);
    }

    res.json({ ok: true, action: formatAction(updated) });
  } catch (err: unknown) {
    if (err instanceof ZodError) return sendValidationError(res, err);
    console.error("[actions] update error:", err);
    res.status(500).json({ ok: false, error: "Failed to update action" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/actions/:id — Delete action
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    unregisterAction(id);

    const deleted = await deleteAction(id);
    if (!deleted) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    res.json({ ok: true, deleted: true });
  } catch (err: unknown) {
    if (err instanceof ZodError) return sendValidationError(res, err);
    console.error("[actions] delete error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete action" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/actions/:id/test — Dry-run with sample event data
// ---------------------------------------------------------------------------
router.post("/:id/test", async (req: Request, res: Response) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const action = await getAction(id);
    if (!action) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    const parsed = testActionSchema.parse(req.body ?? {});
    const triggerEvent: TriggerEvent = {
      type: "test",
      ...(parsed.event ?? {}),
    };

    const result = await executeAction(action, triggerEvent);
    res.json({ ok: true, result });
  } catch (err: unknown) {
    if (err instanceof ZodError) return sendValidationError(res, err);
    console.error("[actions] test error:", err);
    res.status(500).json({ ok: false, error: "Failed to test action" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/actions/:id/logs — Execution logs (paginated)
// ---------------------------------------------------------------------------
const logsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

router.get("/:id/logs", async (req: Request, res: Response) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const action = await getAction(id);
    if (!action) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    const { page, limit } = logsQuerySchema.parse(req.query);
    const logs = await getActionLogs(id, page, limit);
    res.json({ ok: true, ...logs });
  } catch (err: unknown) {
    if (err instanceof ZodError) return sendValidationError(res, err);
    console.error("[actions] logs error:", err);
    res.status(500).json({ ok: false, error: "Failed to get logs" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/:actionId — Inbound webhook endpoint
// ---------------------------------------------------------------------------
router.post("/webhooks/:actionId", async (req: Request, res: Response) => {
  try {
    const actionId = idParamSchema.parse(req.params.actionId);
    const action = await getAction(actionId);
    if (!action) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    if (!action.enabled) {
      res.status(403).json({ ok: false, error: "Action is disabled" });
      return;
    }

    if (action.trigger_type !== "webhook") {
      res.status(400).json({ ok: false, error: "Action is not a webhook trigger" });
      return;
    }

    const triggerEvent: TriggerEvent = {
      type: "webhook",
      body: req.body,
      headers: {
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
      },
      timestamp: new Date().toISOString(),
    };

    const result = await executeAction(action, triggerEvent);
    res.json({ ok: true, result });
  } catch (err: unknown) {
    if (err instanceof ZodError) return sendValidationError(res, err);
    console.error("[actions] webhook error:", err);
    res.status(500).json({ ok: false, error: "Failed to execute webhook action" });
  }
});

// ---------------------------------------------------------------------------
// Helper: format an ActionRow for API response
// JSONB fields are auto-parsed by pg — no JSON.parse needed
// ---------------------------------------------------------------------------
function formatAction(action: ActionRow) {
  const secretKeys = Object.keys(action.secrets);

  return {
    id: action.id,
    name: action.name,
    code: action.code,
    triggerType: action.trigger_type,
    triggerConfig: action.trigger_config,
    secretKeys,
    enabled: action.enabled,
    createdAt: action.created_at,
    updatedAt: action.updated_at,
    webhookUrl:
      action.trigger_type === "webhook"
        ? `/api/actions/webhooks/${action.id}`
        : undefined,
  };
}

export default router;
