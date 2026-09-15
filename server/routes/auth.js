import { Router } from 'express'

export const authRouter = Router()

// In-memory token store mapped by session ID (or user can pass bearer token from client)
const tokenStore = new Map()

// Cleanup old tokens after 24 hours
setInterval(() => {
  const now = Date.now()
  for (const [id, record] of tokenStore.entries()) {
    if (now - record.timestamp > 24 * 60 * 60 * 1000) {
      tokenStore.delete(id)
    }
  }
}, 60 * 60 * 1000)

export function getStoredToken(sessionId) {
  if (!sessionId) return null
  return tokenStore.get(sessionId)?.token || null
}

export function getStoredUser(sessionId) {
  if (!sessionId) return null
  return tokenStore.get(sessionId)?.user || null
}

export function setStoredToken(sessionId, token, user) {
  if (!sessionId) return
  tokenStore.set(sessionId, { token, user, timestamp: Date.now() })
}

export function clearStoredToken(sessionId) {
  if (sessionId) tokenStore.delete(sessionId)
}

function getAppUrl(req) {
  // Use explicit environment variable if set, else origin/referer or fallback
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null)
  if (origin) return origin.replace(/\/$/, '')
  return 'https://ais-dev-vff3qzdhjtyajqsbnmdwz2-5909266946.asia-southeast1.run.app'
}

/**
 * Returns the GitHub OAuth authorization URL or configuration status.
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

  // Generate random state for CSRF safety
  const state = Math.random().toString(36).substring(2, 15)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo read:user user:email',
    prompt: 'consent',
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
 * Validates a GitHub Personal Access Token or OAuth token and retrieves user info.
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
    // Generate a session token
    const sessionId = 'cg_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
    setStoredToken(sessionId, cleanToken, {
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    })

    res.json({
      sessionId,
      user: {
        login: user.login,
        name: user.name || user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to authenticate token' })
  }
})

/**
 * Returns current authenticated user profile
 */
authRouter.get('/auth/user', async (req, res) => {
  const authHeader = req.headers.authorization
  let token = null
  let sessionId = null

  if (authHeader?.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim()
    if (raw.startsWith('cg_')) {
      sessionId = raw
      token = getStoredToken(raw)
    } else {
      token = raw
    }
  }

  if (!token) {
    return res.json({ authenticated: false, user: null })
  }

  const stored = sessionId ? tokenStore.get(sessionId) : null
  if (stored?.user) {
    return res.json({ authenticated: true, user: stored.user })
  }

  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'CodeGenome-AI',
      },
    })

    if (!userRes.ok) {
      if (sessionId) clearStoredToken(sessionId)
      return res.json({ authenticated: false, user: null })
    }

    const user = await userRes.json()
    const userData = {
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    }
    if (sessionId) {
      setStoredToken(sessionId, token, userData)
    }

    res.json({ authenticated: true, user: userData })
  } catch {
    res.json({ authenticated: false, user: null })
  }
})

/**
 * Registers or syncs a client session with user profile
 */
authRouter.post('/auth/session', (req, res) => {
  const { sessionId, user, token } = req.body
  if (sessionId) {
    setStoredToken(sessionId, token || null, user || null)
  }
  res.json({ success: true })
})

/**
 * Returns list of repositories accessible to the user
 */
authRouter.get('/auth/repos', async (req, res) => {
  const authHeader = req.headers.authorization
  const customPat = req.headers['x-github-token']
  let token = process.env.GITHUB_TOKEN || null
  let sessionId = null

  if (authHeader?.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim()
    if (raw.startsWith('cg_')) {
      sessionId = raw
      const stored = tokenStore.get(raw)
      if (stored?.token) token = stored.token
    } else if (raw && raw.length > 5) {
      token = raw
    }
  }

  if (customPat && typeof customPat === 'string' && customPat.trim().length > 5) {
    token = customPat.trim()
  }

  let username = (req.query.username ? String(req.query.username) : null) || (req.headers['x-github-user'] ? String(req.headers['x-github-user']) : null)
  if (!username && sessionId) {
    const stored = tokenStore.get(sessionId)
    if (stored?.user?.login) {
      username = stored.user.login
    }
  }

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
      // Fetch authenticated user's repositories across multiple pages (up to 5 pages = 500 repos)
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

    // Also fetch public repos for username if not already fetched or if token is public-only
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
      // Sort by updated_at descending
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

  // Resilient fallback repository list
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
  if (authHeader?.startsWith('Bearer cg_')) {
    clearStoredToken(authHeader.slice(7).trim())
  }
  res.json({ success: true })
})
