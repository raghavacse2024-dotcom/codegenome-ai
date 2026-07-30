/**
 * Logs each API request with method, URL, status, and duration.
 * @param {import('express').Request} request Express request.
 * @param {import('express').Response} response Express response.
 * @param {import('express').NextFunction} next Express next callback.
 */
export function requestLogger(request, response, next) {
  const startedAt = Date.now()
  response.on('finish', () => console.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${Date.now() - startedAt}ms`))
  next()
}

/**
 * Converts internal errors into user-friendly API responses without leaking secrets.
 * @param {Error & {status?: number, issues?: Array<{message: string}>}} error Error object.
 * @param {import('express').Request} request Express request.
 * @param {import('express').Response} response Express response.
 * @param {import('express').NextFunction} next Express next callback.
 */
export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error)
  const status = error?.status || (error?.name === 'ZodError' ? 400 : 500)
  const rawMessage = error?.issues?.[0]?.message || error?.message || 'Analysis failed. Please retry.'
  const message = friendlyMessage(status, rawMessage)
  console.error(`[CodeGenome] ${request.method} ${request.originalUrl}`, rawMessage)
  response.status(status).json({ error: message })
}

/**
 * Maps low-level service failures to messages a product user can act on.
 * @param {number} status HTTP status.
 * @param {string} message Original error message.
 * @returns {string} Safe message for clients.
 */
export function friendlyMessage(status, message) {
  if (status === 400) return message
  if (status === 404) return 'GitHub repository not found. Check that the URL is public.'
  if (status === 403) return 'GitHub rate limit reached. Add GITHUB_TOKEN to Render.'
  if (status === 504 || /timeout/i.test(message)) return 'Timeout after 60 seconds. Repo too large or external APIs are slow.'
  if (/OpenAI/i.test(message)) return 'OpenAI API error. Using demo mode when possible.'
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}
