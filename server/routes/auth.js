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
    scope: 'read:user repo',
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
 * Returns list of repositories (including private) accessible to the user
 */
authRouter.get('/auth/repos', async (req, res) => {
  const authHeader = req.headers.authorization
  let token = null

  if (authHeader?.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim()
    token = raw.startsWith('cg_') ? getStoredToken(raw) : raw
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required to list private repositories.' })
  }

  try {
    const reposRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30&affiliation=owner,collaborator,organization_member', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'CodeGenome-AI',
      },
    })

    if (!reposRes.ok) {
      return res.status(reposRes.status).json({ error: 'Failed to fetch repositories from GitHub.' })
    }

    const repos = await reposRes.json()
    const mapped = repos.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      private: r.private,
      url: r.html_url,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      updatedAt: r.updated_at,
    }))

    res.json({ repositories: mapped })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to list user repositories' })
  }
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
