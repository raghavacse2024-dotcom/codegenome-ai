import { sessionStore } from './sessionStore.js'
import { verifyFirebaseIdToken } from './firebaseAdmin.js'

/**
 * Resolves a stable canonical application user ID from VERIFIED identity objects.
 * Primary Identity Model:
 * 1. Firebase Auth: verified Firebase UID (e.g. "abc123xyz")
 * 2. GitHub Auth: gh_<verified GitHub numeric ID> (e.g. "gh_12345678")
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
  if (identity.githubUserId || identity.user?.id || identity.id) {
    const numId = identity.githubUserId || identity.user?.id || identity.id
    return `gh_${numId}`
  }
  if (identity.userId && identity.userId !== 'token_user') {
    return String(identity.userId).trim()
  }
  return null
}

/**
 * Verifies a GitHub Personal Access Token against GitHub REST API.
 * Returns verified user metadata with numeric GitHub ID or null if invalid.
 *
 * @param {string} pat Raw GitHub token.
 * @returns {Promise<{ id: number, login: string, name: string, avatar_url: string } | null>}
 */
async function verifyGitHubToken(pat) {
  if (!pat || typeof pat !== 'string' || pat.trim().length < 8) return null
  const cleanPat = pat.trim()

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cleanPat}`,
        'User-Agent': 'CodeGenome-AI',
      },
      signal: AbortSignal.timeout(6_000),
    })

    if (!response.ok) return null
    const user = await response.json()
    if (!user || !user.id || !user.login) return null

    return {
      id: user.id,
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
    }
  } catch {
    return null
  }
}

/**
 * Resolves the authenticated user from Express request headers.
 * Identity is derived exclusively from verified Firebase ID tokens, validated session IDs,
 * or authenticated GitHub tokens.
 *
 * SECURITY: Client-provided identity headers (e.g. x-firebase-uid, x-github-user)
 * and client-constructed session aliases (e.g. cg_google_<uid>) are NEVER trusted.
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

  // 1. Valid Server-Side Session Lookup (CodeGenome GitHub session: cg_sess_...)
  if (candidate && candidate.startsWith('cg_sess_')) {
    const session = sessionStore.getSession(candidate)
    if (session) {
      const ghId = session.user?.id || session.githubUserId ? String(session.user?.id || session.githubUserId) : null
      const ghLogin = session.user?.login || session.githubLogin ? String(session.user?.login || session.githubLogin) : null
      const canonicalUserId = session.userId || (ghId ? `gh_${ghId}` : session.firebaseUid)

      if (canonicalUserId) {
        return {
          authenticated: true,
          userId: canonicalUserId,
          firebaseUid: session.firebaseUid || null,
          githubUserId: ghId,
          githubLogin: ghLogin,
          user: session.user || { id: ghId, login: ghLogin || 'developer' },
          token: session.token || null,
          sessionId: session.sessionId,
          provider: 'github_session',
        }
      }
    }
    return null
  }

  // 2. Cryptographic Firebase ID Token Verification
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
      // Invalid or expired Firebase ID token -> caller receives null / 401
      return null
    }
  }

  // 3. Direct GitHub PAT Token Verification
  const directToken = customPat && typeof customPat === 'string' && customPat.trim().length > 5
    ? customPat.trim()
    : (candidate && !candidate.startsWith('cg_') && candidate.length > 5 ? candidate : null)

  if (directToken) {
    // Check if PAT is already mapped to an active server-side session
    for (const session of sessionStore.sessions.values()) {
      if (session.token === directToken && session.userId && session.userId !== 'token_user') {
        const ghId = session.user?.id ? String(session.user.id) : null
        const ghLogin = session.user?.login ? String(session.user.login) : null
        return {
          authenticated: true,
          userId: session.userId,
          firebaseUid: session.firebaseUid || null,
          githubUserId: ghId,
          githubLogin: ghLogin,
          user: session.user || { id: ghId, login: ghLogin || 'developer' },
          token: session.token,
          sessionId: session.sessionId,
          provider: 'github_pat',
        }
      }
    }

    // Verify raw PAT against GitHub API to obtain numeric identity
    const verifiedGithubUser = await verifyGitHubToken(directToken)
    if (verifiedGithubUser) {
      const canonicalUserId = `gh_${verifiedGithubUser.id}`
      return {
        authenticated: true,
        userId: canonicalUserId,
        firebaseUid: null,
        githubUserId: String(verifiedGithubUser.id),
        githubLogin: verifiedGithubUser.login,
        user: verifiedGithubUser,
        token: directToken,
        sessionId: null,
        provider: 'github_pat',
      }
    }

    // Invalid GitHub PAT -> return null (401 Unauthorized)
    return null
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

  // Enforce strict canonical ownership check: analysis.userId === authenticatedUser.userId
  if (recordUserId) {
    let isOwner = (recordUserId === currentUserId)

    // Legacy migration compatibility: if record used old GitHub username, migrate recordUserId to canonical gh_<numeric_id>
    if (!isOwner && user.githubLogin && recordUserId === user.githubLogin) {
      isOwner = true
      analysis.userId = currentUserId
    }

    if (!isOwner) {
      const err = new Error('Access forbidden: you do not have permission to view this analysis.')
      err.status = 403
      err.code = 'FORBIDDEN'
      throw err
    }
  }

  return true
}
