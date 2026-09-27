import { randomUUID } from 'node:crypto'
import { redactSecrets } from '../services/secretRedactor.js'

/**
 * Logs each API request with method, URL, status, and duration.
 * Attaches a unique correlation request ID to track requests across services.
 */
export function requestLogger(request, response, next) {
  const startedAt = Date.now()
  const requestId = request.headers['x-request-id'] || randomUUID()
  request.id = requestId
  response.setHeader('X-Request-Id', requestId)

  response.on('finish', () => {
    console.log(`[${requestId}] ${request.method} ${request.originalUrl} ${response.statusCode} ${Date.now() - startedAt}ms`)
  })
  next()
}

/**
 * Converts internal errors into secure, user-friendly API responses without leaking secrets,
 * internal filesystem paths, or raw stack traces.
 */
export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error)

  const status = error?.status || (error?.name === 'ZodError' ? 400 : 500)
  const rawMessage = error?.issues?.[0]?.message || error?.message || 'Internal server error.'
  const requestId = request.id || randomUUID()

  // Log full error server-side with redacted credentials
  console.error(`[CodeGenome ERROR] [${requestId}] ${request.method} ${request.originalUrl}:`, redactSecrets(rawMessage))
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    console.error(redactSecrets(error.stack))
  }

  const safeMessage = sanitizeClientMessage(status, rawMessage)
  const code = error?.code || getErrorCode(status)

  response.status(status).json({
    error: safeMessage,
    code,
    requestId,
  })
}

function getErrorCode(status) {
  switch (status) {
    case 400: return 'BAD_REQUEST'
    case 401: return 'UNAUTHORIZED'
    case 403: return 'FORBIDDEN'
    case 404: return 'NOT_FOUND'
    case 429: return 'RATE_LIMIT_EXCEEDED'
    case 504: return 'GATEWAY_TIMEOUT'
    default: return 'INTERNAL_ERROR'
  }
}

/**
 * Strips internal server details, secrets, and filesystem paths from client error messages.
 */
export function sanitizeClientMessage(status, message) {
  if (!message || typeof message !== 'string') {
    return 'An unexpected error occurred. Please try again.'
  }

  // 1. Redact secrets first
  let clean = redactSecrets(message)

  // 2. Strip absolute filesystem paths
  clean = clean.replace(/(?:\/[a-zA-Z0-9_\-\.]+)+/g, (match) => {
    if (match.startsWith('/api') || match.startsWith('/auth')) return match
    return '[internal-path]'
  })

  // 3. Normalize common service messages
  if (status === 400) return clean
  if (status === 401) return clean.includes('Authentication') ? clean : 'Authentication required. Please sign in.'
  if (status === 403) return clean.includes('rate limit') ? clean : (clean.includes('forbidden') ? clean : 'Access forbidden.')
  if (status === 404) return clean.includes('not found') ? clean : 'Requested resource not found.'
  if (status === 429 || /rate limit/i.test(clean)) return 'Rate limit exceeded. Please try again later.'
  if (status === 504 || /timeout/i.test(clean)) return 'Analysis timeout after 60 seconds. The repository may be too large.'
  if (/quota/i.test(clean)) return 'AI service capacity temporarily reached. Please retry shortly.'

  // Production fallback: do not expose raw unhandled internal exceptions
  if (status >= 500) {
    return 'An internal service error occurred. The team has been notified.'
  }

  return clean
}
