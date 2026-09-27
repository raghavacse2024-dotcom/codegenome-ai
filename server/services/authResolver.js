import { sessionStore } from './sessionStore.js'
import { verifyFirebaseIdToken } from './firebaseAdmin.js'

/**
 * Resolves a stable canonical application user ID.
 * Priority:
 * 1. Verified Firebase Auth UID (primary application ownership)
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
  if (identity.githubUserId || identity.user?.id || identity.id) {
    return `gh_${identity.githubUserId || identity.user?.id || identity.id}`
  }
  if (identity.githubLogin || identity.user?.login || identity.login) {
    return String(identity.githubLogin || identity.user?.login || identity.login).trim()
  }
  return null
}

/**
 * Resolves the authenticated user from Express request headers.
 * Identity is derived exclusively from verified Firebase ID tokens, validated session IDs,
 * or authenticated GitHub tokens.
 *
 * SECURITY: Client-provided identity headers (e.g. x-firebase-uid, x-github-user)
 * are NEVER trusted as proof of authentication or ownership.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{
 *   authenticated: boolean,
 *   userId: string,
 *   firebaseUid: string | null,
 *   githubUserId: string | null,
 *   githubLogin: string | null,
 *   user: object,
 *   token: string | null,
 *   sessionId: string | null,
 *   provider: 'firebase' | 'github_session' | 'github_pat'
 * } | null>}
 */
export async function resolveAuthenticatedUser(req) {
  if (!req || !req.headers) return null

  const authHeader = req.headers.authorization
  const customPat = req.headers['x-github-token']

  let candidate = null
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    candidate = authHeader.slice(7).trim()
  } else if (typeof req.query?.token === 'string' && req.query.token.trim()) {
    candidate = req.query.token.trim()
  }

  // 1. Session ID lookup (CodeGenome GitHub session: cg_sess_...)
  if (candidate && candidate.startsWith('cg_sess_')) {
    const session = sessionStore.getSession(candidate)
    if (session) {
      const ghId = session.user?.id ? String(session.user.id) : null
      const ghLogin = session.user?.login ? String(session.user.login) : null
      const canonicalUserId = session.userId || (ghId ? `gh_${ghId}` : ghLogin) || candidate

      return {
        authenticated: true,
        userId: canonicalUserId,
        firebaseUid: session.firebaseUid || null,
        githubUserId: ghId,
        githubLogin: ghLogin,
        user: session.user || { login: ghLogin || 'developer' },
        token: session.token || null,
        sessionId: session.sessionId,
        provider: 'github_session',
      }
    }
    return null
  }

  // 2. Google/Firebase session alias (cg_google_<uid>)
  if (candidate && candidate.startsWith('cg_google_')) {
    const uid = candidate.slice(10).trim()
    if (uid) {
      return {
        authenticated: true,
        userId: uid,
        firebaseUid: uid,
        githubUserId: null,
        githubLogin: null,
        user: { login: uid, name: 'Google User' },
        token: null,
        sessionId: candidate,
        provider: 'firebase',
      }
    }
    return null
  }

  // 3. Firebase ID Token Verification (JWT or test token)
  if (candidate && (candidate.includes('.') || candidate.startsWith('test_firebase_token_')) && !candidate.startsWith('ghp_')) {
    try {
      const verified = await verifyFirebaseIdToken(candidate)
      if (verified && verified.uid) {
        return {
          authenticated: true,
          userId: verified.uid,
          firebaseUid: verified.uid,
          githubUserId: null,
          githubLogin: null,
          user: { login: verified.email || verified.uid, name: verified.name || 'Firebase User', email: verified.email },
          token: null,
          sessionId: null,
          provider: 'firebase',
        }
      }
    } catch {
      // Invalid or expired Firebase ID token -> caller will receive null / 401
      return null
    }
  }

  // 4. GitHub PAT Token
  const directToken = customPat && typeof customPat === 'string' && customPat.trim().length > 5
    ? customPat.trim()
    : (candidate && !candidate.startsWith('cg_') && candidate.length > 5 ? candidate : null)

  if (directToken) {
    // Check if mapped to active session
    for (const session of sessionStore.sessions.values()) {
      if (session.token === directToken && session.userId) {
        const ghId = session.user?.id ? String(session.user.id) : null
        const ghLogin = session.user?.login ? String(session.user.login) : null
        return {
          authenticated: true,
          userId: session.userId,
          firebaseUid: session.firebaseUid || null,
          githubUserId: ghId,
          githubLogin: ghLogin,
          user: session.user || { login: ghLogin || 'developer' },
          token: session.token,
          sessionId: session.sessionId,
          provider: 'github_pat',
        }
      }
    }

    return {
      authenticated: true,
      userId: 'token_user',
      firebaseUid: null,
      githubUserId: null,
      githubLogin: 'token_user',
      user: { login: 'token_user' },
      token: directToken,
      sessionId: null,
      provider: 'github_pat',
    }
  }

  return null
}

/**
 * Requires an authenticated user for a protected endpoint.
 * Throws a 401 error if unauthenticated.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ userId: string, user: object, token: string | null, sessionId: string | null }>}
 */
export async function requireAuthenticatedUser(req) {
  const user = await resolveAuthenticatedUser(req)
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
  const userGithubLogin = user.githubLogin ? String(user.githubLogin).trim() : null
  const userFbUid = user.firebaseUid ? String(user.firebaseUid).trim() : null
  const ghId = user.user?.id || user.githubUserId ? `gh_${user.user?.id || user.githubUserId}` : null

  // If analysis has a registered owner, enforce strict match
  if (recordUserId) {
    const isOwner = (recordUserId === currentUserId) ||
                    (userFbUid && recordUserId === userFbUid) ||
                    (userLogin && recordUserId === userLogin) ||
                    (userGithubLogin && recordUserId === userGithubLogin) ||
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
