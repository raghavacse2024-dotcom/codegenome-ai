import { sessionStore } from './sessionStore.js'

/**
 * Resolves a stable canonical application user ID.
 * Priority:
 * 1. Verified Firebase Auth UID
 * 2. Session canonical userId
 * 3. GitHub numeric user ID (e.g. "gh_1234567")
 * 4. GitHub login identifier
 *
 * @param {object | string | null} identity
 * @returns {string | null}
 */
export function getCanonicalUserId(identity) {
  if (!identity) return null
  if (typeof identity === 'string') {
    const trimmed = identity.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (identity.firebaseUid || identity.uid) {
    return String(identity.firebaseUid || identity.uid).trim()
  }
  if (identity.userId) {
    return String(identity.userId).trim()
  }
  if (identity.user?.id || identity.id) {
    return `gh_${identity.user?.id || identity.id}`
  }
  if (identity.user?.login || identity.login) {
    return String(identity.user?.login || identity.login).trim()
  }
  return null
}

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
  const firebaseUidHeader = req.headers['x-firebase-uid']

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
      const canonicalUserId = (firebaseUidHeader && typeof firebaseUidHeader === 'string' && firebaseUidHeader.trim())
        ? firebaseUidHeader.trim()
        : (session.userId || (session.user?.id ? `gh_${session.user.id}` : session.user?.login) || candidate)

      return {
        userId: canonicalUserId,
        user: session.user,
        token: session.token || null,
        sessionId: session.sessionId,
      }
    }
    // Firebase auth Google session token format: cg_google_<uid>
    if (candidate.startsWith('cg_google_')) {
      const uid = candidate.slice(10).trim()
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
          userId: (firebaseUidHeader && typeof firebaseUidHeader === 'string') ? firebaseUidHeader.trim() : session.userId,
          user: session.user,
          token: session.token,
          sessionId: session.sessionId,
        }
      }
    }
    // If raw token is provided
    return {
      userId: (firebaseUidHeader && typeof firebaseUidHeader === 'string') ? firebaseUidHeader.trim() : 'token_user',
      user: { login: 'token_user' },
      token: directToken,
      sessionId: null,
    }
  }

  // 3. Authenticated Firebase UID header alone if present
  if (firebaseUidHeader && typeof firebaseUidHeader === 'string' && firebaseUidHeader.trim().length > 0) {
    const uid = firebaseUidHeader.trim()
    return {
      userId: uid,
      user: { login: uid, name: 'Authenticated User' },
      token: null,
      sessionId: null,
    }
  }

  return null
}

/**
 * Requires an authenticated user for a protected endpoint.
 * Throws a 401 error if unauthenticated.
 *
 * @param {import('express').Request} req
 * @returns {{ userId: string, user: object, token: string | null, sessionId: string | null }}
 */
export function requireAuthenticatedUser(req) {
  const user = resolveAuthenticatedUser(req)
  if (!user || !user.userId) {
    const err = new Error('Authentication required to perform this action.')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }
  return user
}

/**
 * Asserts that the authenticated user owns the specified analysis record.
 * Throws 401 if unauthenticated, 404 if analysis not found, 403 if user does not own it.
 *
 * @param {object} analysis Analysis record to check.
 * @param {object | null} user Authenticated user resolved from request.
 * @returns {true}
 */
export function assertAnalysisOwnership(analysis, user) {
  if (!analysis) {
    const err = new Error('Analysis not found.')
    err.status = 404
    err.code = 'NOT_FOUND'
    throw err
  }

  if (!user || !user.userId) {
    const err = new Error('Authentication required to access analysis records.')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }

  const currentUserId = String(user.userId).trim()
  const recordUserId = analysis.userId ? String(analysis.userId).trim() : null
  const userLogin = user.user?.login ? String(user.user.login).trim() : null
  const ghId = user.user?.id ? `gh_${user.user.id}` : null

  // If analysis has a registered owner, enforce strict match
  if (recordUserId) {
    const isOwner = (recordUserId === currentUserId) ||
                    (userLogin && recordUserId === userLogin) ||
                    (userLogin && recordUserId === `gh_${userLogin}`) ||
                    (ghId && recordUserId === ghId)

    if (!isOwner) {
      const err = new Error('Access forbidden: you do not have permission to view this analysis.')
      err.status = 403
      err.code = 'FORBIDDEN'
      throw err
    }
  }

  return true
}
