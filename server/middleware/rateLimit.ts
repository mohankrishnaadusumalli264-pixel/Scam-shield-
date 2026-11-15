import type { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const uid = (req as Request & { authUser?: { uid?: string } }).authUser?.uid;
    const key = `${keyPrefix}:${uid || clientIp}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, maxRequests - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      res.status(429).json({
        errorCode: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please wait before retrying.',
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      });
      return;
    }

    // Periodic cleanup when map grows large
    if (buckets.size > 5000) {
      for (const [k, v] of buckets.entries()) {
        if (v.resetAt <= now) {
          buckets.delete(k);
        }
      }
    }

    next();
  };
}
