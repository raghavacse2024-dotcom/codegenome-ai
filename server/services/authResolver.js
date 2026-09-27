import { sessionStore } from './sessionStore.js'

/**
 * Resolves the authenticated user from Express request headers.
 * Identity is derived exclusively from validated session IDs or authenticated Bearer tokens.
 * Client-provided identity headers (e.g. x-github-user) are NEVER trusted as proof of ownership.
 *
 * @param {import('express').Request} req
 * @returns {{ userId: string, user: object, token: string | null, sessionId: string | null } | null}
 */
export function resolveAuthenticatedUser(req) {
  const authHeader = req.headers.authorization
  const customPat = req.headers['x-github-token']

  let candidate = null
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    candidate = authHeader.slice(7).trim()
  } else if (typeof req.query?.token === 'string' && req.query.token.trim()) {
    candidate = req.query.token.trim()
  }

  // 1. Session ID lookup
  if (candidate && candidate.startsWith('cg_')) {
    const session = sessionStore.getSession(candidate)
    if (session) {
      return {
        userId: session.userId || session.user?.login || candidate,
        user: session.user,
        token: session.token || null,
        sessionId: session.sessionId,
      }
    }
    // Firebase auth Google session token format: cg_google_<uid>
    if (candidate.startsWith('cg_google_')) {
      const uid = candidate.slice(10)
      return {
        userId: uid,
        user: { login: uid, name: 'Google User' },
        token: null,
        sessionId: candidate,
      }
    }
  }

  // 2. Direct PAT token check
  const directToken = customPat && typeof customPat === 'string' && customPat.trim().length > 5
    ? customPat.trim()
    : (candidate && !candidate.startsWith('cg_') && candidate.length > 5 ? candidate : null)

  if (directToken) {
    // Check if any active session is mapped to this token
    for (const session of sessionStore.sessions.values()) {
      if (session.token === directToken && session.userId) {
        return {
          userId: session.userId,
          user: session.user,
          token: session.token,
          sessionId: session.sessionId,
        }
      }
    }
    // If raw token is provided, derive user if possible
    return {
      userId: 'token_user',
      user: { login: 'token_user' },
      token: directToken,
      sessionId: null,
    }
  }

  return null
}
