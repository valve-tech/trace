import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import {
  createAlert,
  updateAlertById,
  deleteAlertById,
  getAlertById,
  getAllAlerts,
  getAlertHistory,
  getTriggeredToday,
} from "../services/db.js";
import { dispatch, type MatchData } from "../services/notifier.js";

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const alertTypeEnum = z.enum([
  "address_activity",
  "contract_event",
  "function_call",
  "balance_threshold",
  "failed_tx",
]);

const notificationChannelSchema = z.object({
  type: z.enum(["webhook", "discord", "slack", "telegram"]),
  url: z.string().optional(),
  webhookUrl: z.string().optional(),
  botToken: z.string().optional(),
  chatId: z.string().optional(),
});

const addressActivityConditions = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

const contractEventConditions = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  eventSignature: z.string().min(1, "Event signature required"),
});

const functionCallConditions = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  functionSelector: z.string().min(1, "Function selector required"),
});

const balanceThresholdConditions = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  threshold: z.string().min(1, "Threshold required"),
  direction: z.enum(["above", "below"]),
});

const failedTxConditions = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

const createAlertSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(200),
    type: alertTypeEnum,
    conditions: z.record(z.unknown()),
    notifications: z.array(notificationChannelSchema).default([]),
    enabled: z.boolean().default(true),
    cooldown_seconds: z.number().int().min(0).default(60),
  })
  .superRefine((data, ctx) => {
    // Validate conditions based on type
    let result;
    switch (data.type) {
      case "address_activity":
        result = addressActivityConditions.safeParse(data.conditions);
        break;
      case "contract_event":
        result = contractEventConditions.safeParse(data.conditions);
        break;
      case "function_call":
        result = functionCallConditions.safeParse(data.conditions);
        break;
      case "balance_threshold":
        result = balanceThresholdConditions.safeParse(data.conditions);
        break;
      case "failed_tx":
        result = failedTxConditions.safeParse(data.conditions);
        break;
    }
    if (result && !result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ["conditions", ...issue.path],
        });
      }
    }
  });

const updateAlertSchema = createAlertSchema;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatAlertRow(row: ReturnType<typeof getAlertById>) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    conditions: JSON.parse(row.conditions),
    notifications: JSON.parse(row.notifications),
    enabled: row.enabled === 1,
    cooldown_seconds: row.cooldown_seconds,
    last_triggered_at: row.last_triggered_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// POST /api/alerts — Create alert
// ---------------------------------------------------------------------------
router.post("/", (req: Request, res: Response): void => {
  try {
    const parsed = createAlertSchema.parse(req.body);
    const row = createAlert({
      name: parsed.name,
      type: parsed.type,
      conditions: JSON.stringify(parsed.conditions),
      notifications: JSON.stringify(parsed.notifications),
      enabled: parsed.enabled ? 1 : 0,
      cooldown_seconds: parsed.cooldown_seconds,
    });
    res.status(201).json({ ok: true, alert: formatAlertRow(row) });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ ok: false, error: "Validation error", details: err.errors });
      return;
    }
    console.error("[alerts] create error:", err);
    res.status(500).json({ ok: false, error: "Failed to create alert" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alerts — List all alerts
// ---------------------------------------------------------------------------
router.get("/", (_req: Request, res: Response): void => {
  try {
    const rows = getAllAlerts();
    const triggeredToday = getTriggeredToday();
    const alerts = rows.map(formatAlertRow);
    const activeCount = rows.filter((r) => r.enabled === 1).length;

    res.json({
      ok: true,
      alerts,
      stats: {
        total: rows.length,
        active: activeCount,
        triggered_today: triggeredToday,
      },
    });
  } catch (err) {
    console.error("[alerts] list error:", err);
    res.status(500).json({ ok: false, error: "Failed to list alerts" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alerts/:id — Get alert with recent history
// ---------------------------------------------------------------------------
router.get("/:id", (req: Request, res: Response): void => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid alert ID" });
      return;
    }
    const row = getAlertById(id);
    if (!row) {
      res.status(404).json({ ok: false, error: "Alert not found" });
      return;
    }

    const { rows: history } = getAlertHistory(id, 10, 0);

    res.json({
      ok: true,
      alert: formatAlertRow(row),
      recent_history: history.map((h) => ({
        ...h,
        matched_data: JSON.parse(h.matched_data),
      })),
    });
  } catch (err) {
    console.error("[alerts] get error:", err);
    res.status(500).json({ ok: false, error: "Failed to get alert" });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/alerts/:id — Update alert
// ---------------------------------------------------------------------------
router.put("/:id", (req: Request, res: Response): void => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid alert ID" });
      return;
    }

    const parsed = updateAlertSchema.parse(req.body);
    const updated = updateAlertById(id, {
      name: parsed.name,
      type: parsed.type,
      conditions: JSON.stringify(parsed.conditions),
      notifications: JSON.stringify(parsed.notifications),
      enabled: parsed.enabled ? 1 : 0,
      cooldown_seconds: parsed.cooldown_seconds,
    });

    if (!updated) {
      res.status(404).json({ ok: false, error: "Alert not found" });
      return;
    }

    res.json({ ok: true, alert: formatAlertRow(updated) });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ ok: false, error: "Validation error", details: err.errors });
      return;
    }
    console.error("[alerts] update error:", err);
    res.status(500).json({ ok: false, error: "Failed to update alert" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/alerts/:id — Delete alert
// ---------------------------------------------------------------------------
router.delete("/:id", (req: Request, res: Response): void => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid alert ID" });
      return;
    }

    const deleted = deleteAlertById(id);
    if (!deleted) {
      res.status(404).json({ ok: false, error: "Alert not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[alerts] delete error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete alert" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alerts/:id/history — Paginated alert history
// ---------------------------------------------------------------------------
router.get("/:id/history", (req: Request, res: Response): void => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid alert ID" });
      return;
    }

    const alert = getAlertById(id);
    if (!alert) {
      res.status(404).json({ ok: false, error: "Alert not found" });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const { rows, total } = getAlertHistory(id, limit, offset);

    res.json({
      ok: true,
      history: rows.map((h) => ({
        ...h,
        matched_data: JSON.parse(h.matched_data),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[alerts] history error:", err);
    res.status(500).json({ ok: false, error: "Failed to get alert history" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/alerts/:id/test — Test notification channels
// ---------------------------------------------------------------------------
router.post("/:id/test", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ ok: false, error: "Invalid alert ID" });
      return;
    }

    const alert = getAlertById(id);
    if (!alert) {
      res.status(404).json({ ok: false, error: "Alert not found" });
      return;
    }

    const testMatchData: MatchData = {
      type: "test",
      summary: `This is a test notification for alert "${alert.name}"`,
      blockNumber: 0,
    };

    await dispatch(alert, testMatchData);
    res.json({ ok: true, message: "Test notifications dispatched" });
  } catch (err) {
    console.error("[alerts] test error:", err);
    res.status(500).json({ ok: false, error: "Failed to test notifications" });
  }
});

export default router;
