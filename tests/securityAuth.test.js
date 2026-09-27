import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import express from 'express'
import http from 'node:http'
import fs from 'node:fs'
import { sessionStore } from '../server/services/sessionStore.js'
import { saveAnalysis } from '../server/services/analysisStore.js'
import { analyzeRouter } from '../server/routes/analyze.js'
import { prRouter } from '../server/routes/pr.js'
import { errorHandler } from '../server/middleware/errorHandler.js'

describe('Security: Authentication & Session Management', () => {
  it('generates cryptographically secure OAuth states and prevents reuse', () => {
    const state = sessionStore.createOAuthState({ redirect: '/test' })
    expect(state).toBeDefined()
    expect(state.length).toBeGreaterThanOrEqual(32)

    // Valid on first verification
    const isValidFirst = sessionStore.validateAndConsumeOAuthState(state)
    expect(isValidFirst).toBe(true)

    // Reuse must be blocked (CSRF/replay protection)
    const isValidSecond = sessionStore.validateAndConsumeOAuthState(state)
    expect(isValidSecond).toBe(false)
  })

  it('rejects invalid or tampered OAuth states', () => {
    const invalidState = 'tampered_state_xyz_123'
    const result = sessionStore.validateAndConsumeOAuthState(invalidState)
    expect(result).toBe(false)
  })

  it('rejects expired OAuth states', () => {
    const state = sessionStore.createOAuthState()
    const entry = sessionStore.oauthStates.get(state)
    if (entry) {
      entry.expiresAt = Date.now() - 1000 // force expire
    }

    const isValid = sessionStore.validateAndConsumeOAuthState(state)
    expect(isValid).toBe(false)
  })

  it('generates non-predictable session IDs with cryptographically secure prefix', () => {
    const session1 = sessionStore.createSession({ token: 'test-token-1', userId: 'user1' })
    const session2 = sessionStore.createSession({ token: 'test-token-2', userId: 'user2' })

    expect(session1.sessionId).toMatch(/^cg_sess_[a-f0-9]{64}$/)
    expect(session2.sessionId).toMatch(/^cg_sess_[a-f0-9]{64}$/)
    expect(session1.sessionId).not.toEqual(session2.sessionId)
  })

  it('persists tokens to disk encrypted with AES-256-GCM and never in plaintext', () => {
    const secretToken = 'ghp_secret_token_never_plaintext_on_disk_xyz'
    const session = sessionStore.createSession({ token: secretToken, userId: 'secure_user' })
    sessionStore.save()

    // Read raw file on disk
    if (fs.existsSync(sessionStore.filePath)) {
      const rawDisk = fs.readFileSync(sessionStore.filePath, 'utf8')
      expect(rawDisk).not.toContain(secretToken)
      const parsed = JSON.parse(rawDisk)
      const stored = parsed[session.sessionId]
      expect(stored).toBeDefined()
      // Encrypted format is iv:authTag:ciphertext
      expect(stored.token).toMatch(/^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/)
    }
  })
})

describe('Security: Access Control & Analysis Ownership Verification', () => {
  const app = express()
  app.use(express.json())
  app.use('/api', analyzeRouter)
  app.use('/api', prRouter)
  app.use(errorHandler)

  let server
  let baseUrl
  let ownerSessionId = null
  let attackerSessionId = null
  let ownerAnalysisId = null

  beforeAll(async () => {
    if (!server) {
      server = http.createServer(app)
      await new Promise((resolve) => server.listen(0, resolve))
      const port = server.address().port
      baseUrl = `http://127.0.0.1:${port}`
    }

    // Setup owner session
    const ownerSession = sessionStore.createSession({
      token: 'owner-token',
      userId: 'alice_owner',
      user: { login: 'alice_owner' },
    })
    ownerSessionId = ownerSession.sessionId

    // Setup attacker session
    const attackerSession = sessionStore.createSession({
      token: 'attacker-token',
      userId: 'bob_attacker',
      user: { login: 'bob_attacker' },
    })
    attackerSessionId = attackerSession.sessionId

    // Create analysis belonging to alice_owner
    const saved = await saveAnalysis(
      {
        repo: { owner: 'alice-org', repository: 'alice-repo', url: 'https://github.com/alice-org/alice-repo' },
        results: {
          debt: { data: { totalDebtScore: 40 } },
          refactor: {
            data: {
              target: 'src/index.ts',
              scaffolds: [{ path: 'src/index.ts', content: 'export const a = 1' }],
              diff: { rawPatch: 'diff --git a/src/index.ts b/src/index.ts\n' },
            },
          },
        },
      },
      'alice_owner'
    )
    ownerAnalysisId = saved.analysisId
  }, 30000)

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('returns 401 when GET /api/analysis/:id is unauthenticated', async () => {
    const res = await fetch(`${baseUrl}/api/analysis/${ownerAnalysisId}`)
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 when requested analysis does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/analysis/non-existent-analysis-id`, {
      headers: { Authorization: `Bearer ${ownerSessionId}` },
    })
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.code).toBe('NOT_FOUND')
  })

  it('prevents User B from reading User A analysis (returns 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/analysis/${ownerAnalysisId}`, {
      headers: { Authorization: `Bearer ${attackerSessionId}` },
    })
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('FORBIDDEN')
  })

  it('prevents User B from validating User A refactor (POST /api/pr/validate returns 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/pr/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attackerSessionId}`,
      },
      body: JSON.stringify({ analysisId: ownerAnalysisId }),
    })
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('FORBIDDEN')
  })

  it('prevents User B from creating a PR from User A analysis (POST /api/pr/create returns 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/pr/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attackerSessionId}`,
      },
      body: JSON.stringify({ analysisId: ownerAnalysisId }),
    })
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('FORBIDDEN')
  })

  it('prevents User B from reading User A unified patch (GET /api/pr/patch/:id returns 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/pr/patch/${ownerAnalysisId}`, {
      headers: { Authorization: `Bearer ${attackerSessionId}` },
    })
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('FORBIDDEN')
  })

  it('returns 200 and analysis payload when authenticated owner accesses their analysis', async () => {
    const res = await fetch(`${baseUrl}/api/analysis/${ownerAnalysisId}`, {
      headers: { Authorization: `Bearer ${ownerSessionId}` },
    })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.analysisId).toBe(ownerAnalysisId)
    expect(data.userId).toBe('alice_owner')
  })
})
