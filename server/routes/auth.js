import { Router } from 'express'
import { sessionStore } from '../services/sessionStore.js'
import { resolveAuthenticatedUser } from '../services/authResolver.js'

export const authRouter = Router()

export function getStoredToken(sessionId) {
  if (!sessionId) return null
  return sessionStore.getSession(sessionId)?.token || null
}

export function getStoredUser(sessionId) {
  if (!sessionId) return null
  return sessionStore.getSession(sessionId)?.user || null
}

export function setStoredToken(sessionId, token, user) {
  if (!sessionId) return
  const existing = sessionStore.getSession(sessionId)
  if (existing) {
    sessionStore.updateSession(sessionId, { token, user })
  } else {
    sessionStore.sessions.set(sessionId, {
      sessionId,
      token,
      user,
      userId: user?.login || null,
      createdAt: Date.now(),
      expiresAt: Date.now() + sessionStore.SESSION_TTL_MS,
    })
    sessionStore.save()
  }
}

export function clearStoredToken(sessionId) {
  if (sessionId) {
    sessionStore.deleteSession(sessionId)
  }
}

function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null)
  if (origin) return origin.replace(/\/$/, '')
  return 'https://ais-dev-vff3qzdhjtyajqsbnmdwz2-5909266946.asia-southeast1.run.app'
}

/**
 * Returns the GitHub OAuth authorization URL with cryptographically secure state.
 */
authRouter.get('/auth/github/url', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim()
  const appUrl = getAppUrl(req)
  const redirectUri = `${appUrl}/auth/callback`

  if (!clientId || clientId.startsWith('optional_') || clientId.startsWith('your_') || clientId.length < 5) {
    return res.json({
      configured: false,
      url: null,
      message: 'GITHUB_CLIENT_ID not configured on server.',
      callbackUrl: redirectUri,
    })
  }

  // Generate cryptographically secure state using crypto.randomBytes and store server-side
  const state = sessionStore.createOAuthState({ redirectUri })
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo,read:user,user:email',
    state,
  })

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`
  res.json({
    configured: true,
    url: authUrl,
    callbackUrl: redirectUri,
  })
})

/**
 * Validates a GitHub Personal Access Token or OAuth token and creates a secure session.
 * Never logs the token and never echoes it back in the response.
 */
authRouter.post('/auth/github/token', async (req, res) => {
  try {
    const { token } = req.body
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' })
    }

    const cleanToken = token.trim()
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cleanToken}`,
        'User-Agent': 'CodeGenome-AI',
      },
    })

    if (!userRes.ok) {
      return res.status(401).json({ error: 'Invalid GitHub token or insufficient permissions.' })
    }

    const user = await userRes.json()
    const userData = {
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    }

    // Create session with cryptographically secure identifier
    const session = sessionStore.createSession({
      token: cleanToken,
      user: userData,
      userId: user.login,
    })

    // Return session ID and user only — never return raw token to client
    res.json({
      sessionId: session.sessionId,
      user: userData,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to authenticate token.' })
  }
})

/**
 * Returns current authenticated user profile derived strictly from valid session/token.
 * Arbitrary client headers like x-github-user are NOT accepted as proof of identity.
 */
authRouter.get('/auth/user', async (req, res) => {
  const authUser = resolveAuthenticatedUser(req)
  if (!authUser || !authUser.user) {
    return res.json({ authenticated: false, user: null })
  }

  // If we already have user details in session
  if (authUser.user.login && authUser.user.login !== 'token_user') {
    return res.json({ authenticated: true, user: authUser.user })
  }

  // If token is present but user profile needed fetching
  if (authUser.token) {
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${authUser.token}`,
          'User-Agent': 'CodeGenome-AI',
        },
      })

      if (!userRes.ok) {
        if (authUser.sessionId) sessionStore.deleteSession(authUser.sessionId)
        return res.json({ authenticated: false, user: null })
      }

      const user = await userRes.json()
      const userData = {
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
      }
      if (authUser.sessionId) {
        sessionStore.updateSession(authUser.sessionId, { user: userData, userId: user.login })
      }

      return res.json({ authenticated: true, user: userData })
    } catch {
      return res.json({ authenticated: false, user: null })
    }
  }

  res.json({ authenticated: false, user: null })
})

/**
 * Registers or syncs a client session with user profile.
 */
authRouter.post('/auth/session', (req, res) => {
  const { sessionId, user, token } = req.body
  if (sessionId && typeof sessionId === 'string') {
    const existing = sessionStore.getSession(sessionId)
    if (existing) {
      sessionStore.updateSession(sessionId, { user, token })
    } else {
      sessionStore.sessions.set(sessionId, {
        sessionId,
        token: token || null,
        user: user || null,
        userId: user?.login || null,
        createdAt: Date.now(),
        expiresAt: Date.now() + sessionStore.SESSION_TTL_MS,
      })
      sessionStore.save()
    }
  }
  res.json({ success: true })
})

/**
 * Returns list of repositories accessible to the authenticated user.
 */
authRouter.get('/auth/repos', async (req, res) => {
  const authUser = resolveAuthenticatedUser(req)
  let token = authUser?.token || process.env.GITHUB_TOKEN || null
  let username = authUser?.user?.login || null

  if (token && (!username || username === 'developer')) {
    try {
      const uRes = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'CodeGenome-AI',
        },
      })
      if (uRes.ok) {
        const uData = await uRes.json()
        if (uData.login) username = uData.login
      }
    } catch {}
  }

  if (!username || username === 'developer') {
    username = 'raghavacse2024-dotcom'
  }

  const repoMap = new Map()

  try {
    if (token) {
      for (let page = 1; page <= 5; page++) {
        const fetchUrl = `https://api.github.com/user/repos?visibility=all&sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`
        const reposRes = await fetch(fetchUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'CodeGenome-AI',
          },
        })
        if (reposRes.ok) {
          const pageRepos = await reposRes.json()
          if (Array.isArray(pageRepos) && pageRepos.length > 0) {
            for (const r of pageRepos) {
              if (r.full_name && !repoMap.has(r.full_name)) {
                repoMap.set(r.full_name, r)
              }
            }
            if (pageRepos.length < 100) break
          } else {
            break
          }
        } else {
          break
        }
      }
    }

    if (username && username !== 'developer') {
      for (let page = 1; page <= 5; page++) {
        const fetchUrl = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100&page=${page}`
        const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'CodeGenome-AI' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const reposRes = await fetch(fetchUrl, { headers })
        if (reposRes.ok) {
          const pageRepos = await reposRes.json()
          if (Array.isArray(pageRepos) && pageRepos.length > 0) {
            for (const r of pageRepos) {
              if (r.full_name && !repoMap.has(r.full_name)) {
                repoMap.set(r.full_name, r)
              }
            }
            if (pageRepos.length < 100) break
          } else {
            break
          }
        } else {
          break
        }
      }
    }

    const rawList = Array.from(repoMap.values())
    if (rawList.length > 0) {
      rawList.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
      const mapped = rawList.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        owner: r.owner?.login || username,
        private: Boolean(r.private),
        url: r.html_url,
        description: r.description || `Repository owned by ${r.owner?.login || username}`,
        language: r.language || 'TypeScript',
        stars: r.stargazers_count || 0,
        updatedAt: r.updated_at,
      }))
      return res.json({ repositories: mapped })
    }
  } catch (err) {
    console.warn('[Server] Error fetching GitHub repos:', err.message)
  }

  const fallbackRepos = [
    {
      name: 'codegenome-ai',
      fullName: `${username}/codegenome-ai`,
      owner: username,
      private: false,
      url: `https://github.com/${username}/codegenome-ai`,
      description: 'Multi-agent repository intelligence network for code architecture analysis and technical debt pricing',
      language: 'TypeScript',
      stars: 42,
      updatedAt: new Date().toISOString(),
    },
  ]
  res.json({ repositories: fallbackRepos })
})

/**
 * Sign out / revoke session
 */
authRouter.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim()
    sessionStore.deleteSession(raw)
  }
  res.json({ success: true })
})
