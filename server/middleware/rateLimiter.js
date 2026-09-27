/**
 * Sliding Window Rate Limiter Middleware.
 * Prevents system abuse on resource-intensive AI and analysis routes.
 */

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000 // 1 minute default
    this.maxRequests = options.maxRequests || 20 // max requests per window
    this.message = options.message || 'Analysis limit reached. Please try again later.'
    this.hits = new Map()

    // Periodic cleanup of stale tracking windows
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [key, timestamps] of this.hits.entries()) {
        const active = timestamps.filter((t) => now - t < this.windowMs)
        if (active.length === 0) {
          this.hits.delete(key)
        } else {
          this.hits.set(key, active)
        }
      }
    }, 60 * 1000)
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  middleware() {
    return (req, res, next) => {
      // In testing environments, bypass rate limiting
      if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
        return next()
      }

      const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client'
      const authHeader = req.headers.authorization
      const key = authHeader?.startsWith('Bearer cg_') ? authHeader.slice(7).trim() : String(clientIp)

      const now = Date.now()
      const timestamps = this.hits.get(key) || []
      const recent = timestamps.filter((t) => now - t < this.windowMs)

      if (recent.length >= this.maxRequests) {
        res.setHeader('Retry-After', Math.ceil(this.windowMs / 1000))
        return res.status(429).json({
          error: this.message,
          code: 'RATE_LIMIT_EXCEEDED',
        })
      }

      recent.push(now)
      this.hits.set(key, recent)
      next()
    }
  }
}

export const analyzeRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'Analysis limit reached. Please try again later.',
}).middleware()

export const qaRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 35,
  message: 'Question limit reached. Please try again later.',
}).middleware()
