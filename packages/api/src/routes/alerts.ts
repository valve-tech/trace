import { Router, type Request, type Response } from "express";
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
import { ApiError, asyncRoute, respond } from "../lib/respond.js";
import { resolveChainIdParam } from "../lib/chainParam.js";
import { createAlertSchema, updateAlertSchema } from "./alerts/schemas.js";
import { formatAlertRow } from "./alerts/serialize.js";

const router = Router();

function requireId(raw: string | string[] | undefined): number {
  const id = parseInt(String(raw ?? ""), 10);
  if (isNaN(id)) throw new ApiError(400, "Invalid alert ID");
  return id;
}

async function requireAlertById(id: number) {
  const alert = await getAlertById(id);
  if (!alert) throw new ApiError(404, "Alert not found");
  return alert;
}

// ---------------------------------------------------------------------------
// POST /api/alerts — Create alert
// ---------------------------------------------------------------------------
router.post(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = createAlertSchema.parse(req.body);
    // The web client threads chainid as `?chainid=N` (scoped()); API
    // consumers may put it in the body. Query wins when both are present.
    const chainId = resolveChainIdParam(req.query.chainid ?? parsed.chainid);
    const row = await createAlert({
      name: parsed.name,
      type: parsed.type,
      chain_id: chainId,
      conditions: JSON.stringify(parsed.conditions),
      notifications: JSON.stringify(parsed.notifications),
      enabled: parsed.enabled,
      cooldown_seconds: parsed.cooldown_seconds,
    });
    res.status(201).json({ ok: true, alert: formatAlertRow(row) });
  }, "alerts"),
);

// ---------------------------------------------------------------------------
// GET /api/alerts — List alerts for a chain (?chainid=N, default 369)
// ---------------------------------------------------------------------------
router.get(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const chainId = resolveChainIdParam(req.query.chainid);
    const rows = await getAllAlerts(chainId);
    const triggeredToday = await getTriggeredToday(chainId);
    const alerts = rows.map(formatAlertRow);
    const activeCount = rows.filter((r) => r.enabled).length;

    respond.ok(res, {
      alerts,
      stats: {
        total: rows.length,
        active: activeCount,
        triggered_today: triggeredToday,
      },
    });
  }, "alerts"),
);

// ---------------------------------------------------------------------------
// GET /api/alerts/:id — Get alert with recent history
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const id = requireId(req.params.id);
    const row = await requireAlertById(id);
    const { rows: history } = await getAlertHistory(id, 10, 0);

    respond.ok(res, {
      alert: formatAlertRow(row),
      recent_history: history.map((h) => ({ ...h, matched_data: h.matched_data })),
    });
  }, "alerts"),
);

// ---------------------------------------------------------------------------
// PUT /api/alerts/:id — Update alert
// ---------------------------------------------------------------------------
router.put(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const id = requireId(req.params.id);
    const parsed = updateAlertSchema.parse(req.body);
    const existing = await requireAlertById(id);
    // Omitted chainid keeps the alert on its current chain — an old client
    // toggling `enabled` must not silently migrate the alert to 369.
    const rawChainId = req.query.chainid ?? parsed.chainid;
    const chainId =
      rawChainId === undefined || rawChainId === ""
        ? existing.chain_id
        : resolveChainIdParam(rawChainId);
    const updated = await updateAlertById(id, {
      name: parsed.name,
      type: parsed.type,
      chain_id: chainId,
      conditions: JSON.stringify(parsed.conditions),
      notifications: JSON.stringify(parsed.notifications),
      enabled: parsed.enabled,
      cooldown_seconds: parsed.cooldown_seconds,
    });

    if (!updated) throw new ApiError(404, "Alert not found");
    respond.ok(res, { alert: formatAlertRow(updated) });
  }, "alerts"),
);

// ---------------------------------------------------------------------------
// DELETE /api/alerts/:id — Delete alert
// ---------------------------------------------------------------------------
router.delete(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const id = requireId(req.params.id);
    const deleted = await deleteAlertById(id);
    if (!deleted) throw new ApiError(404, "Alert not found");
    respond.ok(res);
  }, "alerts"),
);

// ---------------------------------------------------------------------------
// GET /api/alerts/:id/history — Paginated alert history
// ---------------------------------------------------------------------------
router.get(
  "/:id/history",
  asyncRoute(async (req: Request, res: Response) => {
    const id = requireId(req.params.id);
    await requireAlertById(id);

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string, 10) || 20),
    );
    const offset = (page - 1) * limit;

    const { rows, total } = await getAlertHistory(id, limit, offset);

    respond.ok(res, {
      history: rows.map((h) => ({ ...h, matched_data: h.matched_data })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }, "alerts"),
);

// ---------------------------------------------------------------------------
// POST /api/alerts/:id/test — Test notification channels
// ---------------------------------------------------------------------------
router.post(
  "/:id/test",
  asyncRoute(async (req: Request, res: Response) => {
    const id = requireId(req.params.id);
    const alert = await requireAlertById(id);

    const testMatchData: MatchData = {
      type: "test",
      summary: `This is a test notification for alert "${alert.name}"`,
      blockNumber: 0,
    };

    await dispatch(alert, testMatchData);
    respond.ok(res, { message: "Test notifications dispatched" });
  }, "alerts"),
);

export default router;
