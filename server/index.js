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

// OAuth Callback handler matching AI Studio OAuth skill specification
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, error, error_description } = req.query

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
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(errorMsg)} }, '*');
              setTimeout(() => window.close(), 2500);
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

    let user = { login: 'developer' }
    if (userRes.ok) {
      user = await userRes.json()
    }

    const sessionId = 'cg_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
    const userData = {
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
    }
    setStoredToken(sessionId, accessToken, userData)

    // Return popup postMessage script per OAuth skill guidelines
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
              sessionId: ${JSON.stringify(sessionId)},
              user: ${JSON.stringify(userData)}
            };
            if (window.opener) {
              window.opener.postMessage(payload, '*');
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
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(err.message)} }, '*');
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
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
    root,
  })
  app.use(vite.middlewares)
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl
    try {
      let template = await fs.promises.readFile(path.resolve(root, 'index.html'), 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template)
    } catch (e) {
      vite.ssrFixStacktrace(e)
      next(e)
    }
  })
} else {
  app.use(express.static(path.join(root, 'dist')))
  app.get('*', (_, response) => response.sendFile(path.join(root, 'dist', 'index.html')))
}

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Invalid JSON payload.' })
  }
  next(error)
})
app.use(errorHandler)

app.listen(port, '0.0.0.0', () => console.log(`CodeGenome listening on port ${port}`)).on('error', (error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
