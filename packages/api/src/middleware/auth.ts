import type { Request, Response, NextFunction } from "express";
import { validateApiKey, type ApiKeyValidateResult } from "../services/apiKeys.js";

// ---------------------------------------------------------------------------
// Extend Express Request with API key data
// ---------------------------------------------------------------------------

declare global {
  // Express type augmentation requires the namespace form — there is no
  // ES-module equivalent for merging into the global Express.Request.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKeyData?: ApiKeyValidateResult;
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory rate limiter
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000; // 60-second sliding window

/**
 * Per-IP cap for unauthenticated `/api` requests, per 60s.
 *
 * Defaults to 0 = DISABLED. This is an internal-only app, and the hot read
 * endpoints (latest/summary, blocks, txs/recent, gas, mempool) are served
 * from server-side caches — not upstream passthroughs — so throttling our
 * own dashboard polling protects nothing. A public deployment can re-enable
 * a conservative cap with e.g. `API_UNAUTH_RATE_LIMIT=30`. Authenticated
 * requests are always limited per their own key's `rateLimit`, regardless.
 */
const UNAUTHENTICATED_LIMIT = Number(process.env.API_UNAUTH_RATE_LIMIT ?? 0);

const rateLimitMap = new Map<string, RateLimitBucket>();

// Evict stale rate limit buckets every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitMap) {
    if (now - bucket.windowStart >= WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 300_000).unref();

function isRateLimited(bucketKey: string, limit: number): boolean {
  const now = Date.now();
  const existing = rateLimitMap.get(bucketKey);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    // Start a fresh window
    rateLimitMap.set(bucketKey, { count: 1, windowStart: now });
    return false;
  }

  if (existing.count >= limit) {
    return true;
  }

  existing.count += 1;
  return false;
}

/** Seconds remaining until the current window resets. */
function retryAfterSeconds(bucketKey: string): number {
  const bucket = rateLimitMap.get(bucketKey);
  if (!bucket) return 0;
  const elapsed = Date.now() - bucket.windowStart;
  return Math.max(0, Math.ceil((WINDOW_MS - elapsed) / 1000));
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawKey =
    (req.headers["x-api-key"] as string | undefined) ??
    (req.query["apiKey"] as string | undefined);

  if (rawKey) {
    const keyData = await validateApiKey(rawKey);

    if (!keyData) {
      res.status(401).json({ ok: false, error: "Invalid API key" });
      return;
    }

    const bucketKey = `key:${keyData.id}`;
    if (isRateLimited(bucketKey, keyData.rateLimit)) {
      res
        .status(429)
        .set("Retry-After", String(retryAfterSeconds(bucketKey)))
        .json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    req.apiKeyData = keyData;
    next();
    return;
  }

  // Unauthenticated — apply a conservative per-IP limit, unless disabled
  // (API_UNAUTH_RATE_LIMIT <= 0) for internal deployments.
  if (UNAUTHENTICATED_LIMIT <= 0) {
    next();
    return;
  }

  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const bucketKey = `ip:${ip}`;

  if (isRateLimited(bucketKey, UNAUTHENTICATED_LIMIT)) {
    res
      .status(429)
      .set("Retry-After", String(retryAfterSeconds(bucketKey)))
      .json({ ok: false, error: "Rate limit exceeded" });
    return;
  }

  next();
}
