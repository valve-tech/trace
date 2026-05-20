import { Router, type Request, type Response } from "express";
import {
  createAction,
  getAction,
  listActions,
  updateAction,
  deleteAction,
  getActionLogs,
  getTodayExecutions,
} from "../services/actionsDb.js";
import {
  executeAction,
  type TriggerEvent,
} from "../services/actionExecutor.js";
import {
  registerAction,
  unregisterAction,
} from "../services/actionScheduler.js";
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import {
  createActionSchema,
  idParamSchema,
  logsQuerySchema,
  testActionSchema,
  updateActionSchema,
} from "./actions/schemas.js";
import { formatAction } from "./actions/serialize.js";

const router = Router();

async function requireAction(rawId: string | string[] | undefined) {
  const id = idParamSchema.parse(rawId);
  const action = await getAction(id);
  if (!action) throw new ApiError(404, "Action not found");
  return action;
}

// ---------------------------------------------------------------------------
// POST /api/actions — Create action
// ---------------------------------------------------------------------------
router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
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
  }, "actions"),
);

// ---------------------------------------------------------------------------
// GET /api/actions — List all actions
// ---------------------------------------------------------------------------
router.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const actions = await listActions();
    const todayExecutions = await getTodayExecutions();
    const enabledCount = actions.filter((a) => a.enabled).length;

    respond.ok(res, {
      actions: actions.map(formatAction),
      stats: {
        total: actions.length,
        active: enabledCount,
        todayExecutions,
      },
    });
  }, "actions"),
);

// ---------------------------------------------------------------------------
// GET /api/actions/:id — Get action details
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const action = await requireAction(req.params.id);
    respond.ok(res, { action: formatAction(action) });
  }, "actions"),
);

// ---------------------------------------------------------------------------
// PUT /api/actions/:id — Update action
// ---------------------------------------------------------------------------
router.put(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const existing = await requireAction(req.params.id);
    const parsed = updateActionSchema.parse(req.body);

    const updated = await updateAction(existing.id, {
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

    if (!updated) throw new ApiError(404, "Action not found");

    unregisterAction(existing.id);
    if (updated.enabled) registerAction(updated);

    respond.ok(res, { action: formatAction(updated) });
  }, "actions"),
);

// ---------------------------------------------------------------------------
// DELETE /api/actions/:id — Delete action
// ---------------------------------------------------------------------------
router.delete(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const id = idParamSchema.parse(req.params.id);
    unregisterAction(id);

    const deleted = await deleteAction(id);
    if (!deleted) throw new ApiError(404, "Action not found");
    respond.ok(res, { deleted: true });
  }, "actions"),
);

// ---------------------------------------------------------------------------
// POST /api/actions/:id/test — Dry-run with sample event data
// ---------------------------------------------------------------------------
router.post(
  "/:id/test",
  asyncRoute(async (req: Request, res: Response) => {
    const action = await requireAction(req.params.id);
    const parsed = testActionSchema.parse(req.body ?? {});

    const triggerEvent: TriggerEvent = {
      type: "test",
      ...(parsed.event ?? {}),
    };

    const result = await executeAction(action, triggerEvent);
    respond.ok(res, { result });
  }, "actions"),
);

// ---------------------------------------------------------------------------
// GET /api/actions/:id/logs — Execution logs (paginated)
// ---------------------------------------------------------------------------
router.get(
  "/:id/logs",
  asyncRoute(async (req: Request, res: Response) => {
    const action = await requireAction(req.params.id);
    const { page, limit } = logsQuerySchema.parse(req.query);
    const logs = await getActionLogs(action.id, page, limit);
    respond.ok(res, logs);
  }, "actions"),
);

// ---------------------------------------------------------------------------
// POST /api/webhooks/:actionId — Inbound webhook endpoint
// ---------------------------------------------------------------------------
router.post(
  "/webhooks/:actionId",
  asyncRoute(async (req: Request, res: Response) => {
    const action = await requireAction(req.params.actionId);

    if (!action.enabled) throw new ApiError(403, "Action is disabled");
    if (action.trigger_type !== "webhook") {
      throw new ApiError(400, "Action is not a webhook trigger");
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
    respond.ok(res, { result });
  }, "actions"),
);

export default router;
