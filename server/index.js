import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { analyzeRouter } from './routes/analyze.js'
import { authRouter, setStoredToken } from './routes/auth.js'
import { downloadRouter } from './routes/download.js'
import { healthRouter } from './routes/health.js'
import { qaRouter } from './routes/qa.js'
import { prRouter } from './routes/pr.js'
import { errorHandler, requestLogger } from './middleware/errorHandler.js'
import { sessionStore } from './services/sessionStore.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.use(cors())
app.use(express.json({ limit: '10kb' }))
app.use(requestLogger)

app.use('/api', healthRouter)
app.use('/api', authRouter)
app.use('/api', analyzeRouter)
app.use('/api', downloadRouter)
app.use('/api', qaRouter)
app.use('/api', prRouter)

// Return JSON 404 for any unhandled /api/* requests so they never fall through to Vite middlewares
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` })
})

/**
 * Resolves and validates a clean HTTP/HTTPS application origin for secure OAuth postMessage calls.
 * Prevents wildcard '*' postMessage target origins in production.
 * @param {import('express').Request} [req]
 * @returns {string}
 */
export function getAppOrigin(req) {
  // Check client request headers first if present
  const headerOrigin = req?.headers?.origin || (req?.headers?.referer ? new URL(req.headers.referer).origin : null)
  if (headerOrigin) {
    try {
      const parsed = new URL(headerOrigin)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin
      }
    } catch {}
  }

  const configured = process.env.APP_URL || process.env.FRONTEND_URL || process.env.VITE_API_URL
  if (configured && typeof configured === 'string') {
    try {
      const parsed = new URL(configured.trim())
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin
      }
    } catch {}
  }

  // Non-production fallback
  if (process.env.NODE_ENV !== 'production' || Boolean(process.env.VITEST)) {
    const port = Number(process.env.PORT || 3000)
    return `http://localhost:${port}`
  }

  throw new Error('Production OAuth security configuration error: APP_URL or FRONTEND_URL environment variable must specify a valid HTTP/HTTPS origin.')
}

// OAuth Callback handler with cryptographically secure CSRF state verification
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  let appOrigin = 'http://localhost:3000'
  try {
    appOrigin = getAppOrigin(req)
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).send(`Production OAuth error: ${escapeHtml(err.message)}`)
    }
  }

  const { code, state, error, error_description } = req.query

  if (error || !code) {
    const errorMsg = error_description || error || 'OAuth authorization was cancelled or failed.'
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Failed</title></head>
        <body style="font-family:system-ui,sans-serif;background:#091220;color:#e8f1fb;padding:32px;text-align:center;">
          <h2 style="color:#ff6b6b;">GitHub Authentication Failed</h2>
          <p>${escapeHtml(String(errorMsg))}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(errorMsg)} }, ${JSON.stringify(appOrigin)});
              setTimeout(() => window.close(), 2500);
            }
          </script>
        </body>
      </html>
    `)
  }

  // Validate OAuth state against server-side store to prevent CSRF and replay attacks
  const isValidState = sessionStore.validateAndConsumeOAuthState(state)
  if (!isValidState) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Invalid OAuth State</title></head>
        <body style="font-family:system-ui,sans-serif;background:#091220;color:#e8f1fb;padding:32px;text-align:center;">
          <h2 style="color:#ff6b6b;">Authentication Security Error</h2>
          <p>Invalid or expired OAuth state parameter (CSRF protection failed). Please try signing in again.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Invalid or expired OAuth state. Please initiate login again.' }, ${JSON.stringify(appOrigin)});
              setTimeout(() => window.close(), 3000);
            }
          </script>
        </body>
      </html>
    `)
  }

  try {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim()
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim()

    if (!clientId || !clientSecret) {
      throw new Error('Server missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET configuration.')
    }

    // Exchange code for access token with GitHub
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })

    const tokenData = await tokenRes.json()
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange authorization code.')
    }

    const accessToken = tokenData.access_token

    // Fetch user details
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'CodeGenome-AI',
      },
    })

    if (!userRes.ok) {
      throw new Error('Failed to retrieve GitHub user profile.')
    }

    const user = await userRes.json()
    if (!user || !user.id || !user.login) {
      throw new Error('GitHub user profile response missing numeric user ID.')
    }

    const canonicalUserId = `gh_${user.id}`
    const userData = {
      id: user.id,
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    }

    // Store token securely on the server; associate with cryptographic session ID and canonical numeric userId
    const session = sessionStore.createSession({
      token: accessToken,
      user: userData,
      userId: canonicalUserId,
    })

    // Return popup postMessage script without exposing raw access token to client
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authenticated</title></head>
        <body style="font-family:system-ui,sans-serif;background:#091220;color:#e8f1fb;padding:32px;text-align:center;">
          <h2 style="color:#7df3c3;">Authenticated as ${escapeHtml(user.login)}</h2>
          <p style="color:#8cafd2;">Connecting session to CodeGenome Cockpit...</p>
          <script>
            const payload = {
              type: 'OAUTH_AUTH_SUCCESS',
              sessionId: ${JSON.stringify(session.sessionId)},
              user: ${JSON.stringify(userData)}
            };
            if (window.opener) {
              window.opener.postMessage(payload, ${JSON.stringify(appOrigin)});
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `)
  } catch (err) {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family:system-ui,sans-serif;background:#091220;color:#e8f1fb;padding:32px;text-align:center;">
          <h2 style="color:#ff6b6b;">Authentication Error</h2>
          <p>${escapeHtml(err.message)}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(err.message)} }, ${JSON.stringify(appOrigin)});
              setTimeout(() => window.close(), 3000);
            }
          </script>
        </body>
      </html>
    `)
  }
})

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

if (process.env.NODE_ENV !== 'production') {
  try {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root,
    })
    app.use(vite.middlewares)
  } catch (err) {
    console.warn('[Server] Vite middleware fallback:', err?.message)
    const distPath = path.join(root, 'dist')
    if (fs.existsSync(path.join(distPath, 'index.html'))) {
      app.use(express.static(distPath))
      app.get('*', (_, response) => response.sendFile(path.join(distPath, 'index.html')))
    } else {
      app.use(express.static(root))
      app.get('*', (_, response) => response.sendFile(path.join(root, 'index.html')))
    }
  }
} else {
  const distPath = path.join(root, 'dist')
  if (fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath))
    app.get('*', (_, response) => response.sendFile(path.join(distPath, 'index.html')))
  } else {
    app.use(express.static(root))
    app.get('*', (_, response) => response.sendFile(path.join(root, 'index.html')))
  }
}

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Invalid JSON payload.' })
  }
  next(error)
})
app.use(errorHandler)

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  app.listen(port, '0.0.0.0', () => console.log(`CodeGenome listening on port ${port}`)).on('error', (error) => {
    console.error('Failed to start server', error)
    process.exit(1)
  })
}
