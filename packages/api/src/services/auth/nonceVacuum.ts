import { vacuumExpiredNonces } from "./nonceStore.js";

/**
 * Periodic vacuum worker for `auth_nonces`.
 *
 * The table grows on every `/api/auth/nonce` call (one row per challenge),
 * but rows become useless ~5 minutes later when their TTL expires. Without
 * a cleanup pass the table accumulates indefinitely — small-rate, but a
 * 4 KB-ish row × months × bots-probing-the-endpoint is real bloat.
 *
 * Cadence: every hour. The DELETE filters on `expires_at < NOW() - 1 hour`,
 * so even with clock skew between worker runs the predicate is safe.
 *
 * `unref()` on the timer handle is the standard pattern for "useful but not
 * load-bearing" timers — Node's event loop will exit when the only work
 * remaining is this interval (matches the wsServer heartbeat).
 */

const VACUUM_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let timer: ReturnType<typeof setInterval> | null = null;

export function startNonceVacuum(): void {
  if (timer) return; // idempotent — startup races and tests both benefit

  timer = setInterval(() => {
    void runVacuumOnce();
  }, VACUUM_INTERVAL_MS);
  timer.unref?.();
}

export function stopNonceVacuum(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Exported for tests + manual triggers. The worker only schedules; the
 * actual SQL lives in `nonceStore.vacuumExpiredNonces`.
 */
export async function runVacuumOnce(): Promise<number> {
  try {
    const removed = await vacuumExpiredNonces();
    if (removed > 0) {
      console.log(`[auth] vacuumed ${removed} expired nonces`);
    }
    return removed;
  } catch (err) {
    console.error("[auth] vacuum failed:", err);
    return 0;
  }
}
