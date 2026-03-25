import { Router, type Request, type Response } from "express";
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
// POST /api/actions — Create action
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, code, triggerType, triggerConfig, secrets } = req.body as {
      name?: string;
      code?: string;
      triggerType?: string;
      triggerConfig?: Record<string, unknown>;
      secrets?: Record<string, string>;
    };

    if (!name || !triggerType) {
      res.status(400).json({ ok: false, error: "name and triggerType are required" });
      return;
    }

    const validTypes = ["block", "event", "periodic", "webhook"];
    if (!validTypes.includes(triggerType)) {
      res.status(400).json({
        ok: false,
        error: `Invalid triggerType. Must be one of: ${validTypes.join(", ")}`,
      });
      return;
    }

    const action = await createAction({
      name,
      code: code ?? "",
      trigger_type: triggerType,
      trigger_config: JSON.stringify(triggerConfig ?? {}),
      secrets: JSON.stringify(secrets ?? {}),
    });

    registerAction(action);

    res.status(201).json({ ok: true, action: formatAction(action) });
  } catch (err: unknown) {
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
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid action ID" });
      return;
    }

    const action = await getAction(id);
    if (!action) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    res.json({ ok: true, action: formatAction(action) });
  } catch (err: unknown) {
    console.error("[actions] get error:", err);
    res.status(500).json({ ok: false, error: "Failed to get action" });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/actions/:id — Update action
// ---------------------------------------------------------------------------
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid action ID" });
      return;
    }

    const existing = await getAction(id);
    if (!existing) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    const { name, code, triggerType, triggerConfig, secrets, enabled } = req.body as {
      name?: string;
      code?: string;
      triggerType?: string;
      triggerConfig?: Record<string, unknown>;
      secrets?: Record<string, string>;
      enabled?: boolean;
    };

    const updated = await updateAction(id, {
      name: name ?? existing.name,
      code: code ?? existing.code,
      trigger_type: triggerType ?? existing.trigger_type,
      trigger_config: triggerConfig
        ? JSON.stringify(triggerConfig)
        : JSON.stringify(existing.trigger_config),
      secrets: secrets ? JSON.stringify(secrets) : JSON.stringify(existing.secrets),
      enabled: enabled ?? existing.enabled,
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
    console.error("[actions] update error:", err);
    res.status(500).json({ ok: false, error: "Failed to update action" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/actions/:id — Delete action
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid action ID" });
      return;
    }

    unregisterAction(id);

    const deleted = await deleteAction(id);
    if (!deleted) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    res.json({ ok: true, deleted: true });
  } catch (err: unknown) {
    console.error("[actions] delete error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete action" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/actions/:id/test — Dry-run with sample event data
// ---------------------------------------------------------------------------
router.post("/:id/test", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid action ID" });
      return;
    }

    const action = await getAction(id);
    if (!action) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    const { event } = req.body as { event?: Record<string, unknown> };
    const triggerEvent: TriggerEvent = {
      type: "test",
      ...(event ?? {}),
    };

    const result = await executeAction(action, triggerEvent);
    res.json({ ok: true, result });
  } catch (err: unknown) {
    console.error("[actions] test error:", err);
    res.status(500).json({ ok: false, error: "Failed to test action" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/actions/:id/logs — Execution logs (paginated)
// ---------------------------------------------------------------------------
router.get("/:id/logs", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid action ID" });
      return;
    }

    const action = await getAction(id);
    if (!action) {
      res.status(404).json({ ok: false, error: "Action not found" });
      return;
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

    const logs = await getActionLogs(id, page, limit);
    res.json({ ok: true, ...logs });
  } catch (err: unknown) {
    console.error("[actions] logs error:", err);
    res.status(500).json({ ok: false, error: "Failed to get logs" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/:actionId — Inbound webhook endpoint
// ---------------------------------------------------------------------------
router.post("/webhooks/:actionId", async (req: Request, res: Response) => {
  try {
    const actionId = parseInt(String(req.params.actionId ?? ""), 10);
    if (isNaN(actionId)) {
      res.status(400).json({ ok: false, error: "Invalid action ID" });
      return;
    }

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
