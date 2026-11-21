interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitGlobal {
  _quorixRateLimits?: Map<string, RateLimitEntry>;
}

const globalForRateLimit = global as unknown as RateLimitGlobal;

function getStore(): Map<string, RateLimitEntry> {
  if (!globalForRateLimit._quorixRateLimits) {
    globalForRateLimit._quorixRateLimits = new Map();
  }
  return globalForRateLimit._quorixRateLimits;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window limiter for a single Node process. Good enough for the demo and
 * a single-instance deployment; replace with Redis/Upstash when horizontally
 * scaling.
 */
export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const existing = store.get(params.key);

  if (!existing || existing.resetAt <= now) {
    store.set(params.key, {
      count: 1,
      resetAt: now + params.windowMs,
    });
    return {
      allowed: true,
      limit: params.limit,
      remaining: Math.max(0, params.limit - 1),
      retryAfterSeconds: Math.ceil(params.windowMs / 1000),
    };
  }

  existing.count += 1;
  const allowed = existing.count <= params.limit;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000)
  );

  if (store.size > 10_000) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }

  return {
    allowed,
    limit: params.limit,
    remaining: Math.max(0, params.limit - existing.count),
    retryAfterSeconds,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    ...(result.allowed
      ? {}
      : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}
