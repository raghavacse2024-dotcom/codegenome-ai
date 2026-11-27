/**
 * Sliding Window Rate Limiter Middleware.
 * Prevents abuse on resource-intensive AI, auth, PR, and download routes.
 */

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000
    this.maxRequests = options.maxRequests || 20
    this.message = options.message || 'Rate limit reached. Please try again later.'
    this.hits = new Map()

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
      if ((process.env.NODE_ENV === 'test' || process.env.VITEST) && req.headers['x-test-rate-limit'] !== 'enforce') {
        return next()
      }

      const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-client'
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

export const authRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many authentication requests. Please try again shortly.',
}).middleware()

export const prRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'Pull request operation limit reached. Please wait before retrying.',
}).middleware()

export const downloadRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 40,
  message: 'Download limit reached. Please try again shortly.',
}).middleware()
