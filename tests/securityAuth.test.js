import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import express from 'express'
import http from 'node:http'
import fs from 'node:fs'
import { sessionStore, encryptToken, decryptToken } from '../server/services/sessionStore.js'
import { saveAnalysis } from '../server/services/analysisStore.js'
import { analyzeRouter } from '../server/routes/analyze.js'
import { prRouter } from '../server/routes/pr.js'
import { downloadRouter } from '../server/routes/download.js'
import { qaRouter } from '../server/routes/qa.js'
import { errorHandler } from '../server/middleware/errorHandler.js'
import { resolveAuthenticatedUser } from '../server/services/authResolver.js'

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

  it('handles invalid decryption payloads safely without throwing crashes', () => {
    expect(decryptToken('invalid:payload')).toBeNull()
    expect(decryptToken('malformed_hex_iv:tag:data')).toBeNull()
  })

  it('authenticates valid Firebase ID tokens and rejects invalid/expired tokens', async () => {
    // 1. Valid Firebase token
    const validReq = {
      headers: { authorization: 'Bearer test_firebase_token_firebase_user_123' },
    }
    const validUser = await resolveAuthenticatedUser(validReq)
    expect(validUser).toBeDefined()
    expect(validUser.authenticated).toBe(true)
    expect(validUser.userId).toBe('firebase_user_123')
    expect(validUser.firebaseUid).toBe('firebase_user_123')

    // 2. Expired Firebase token -> returns null (401 unauthenticated)
    const expiredReq = {
      headers: { authorization: 'Bearer test_firebase_token_expired_999' },
    }
    const expiredUser = await resolveAuthenticatedUser(expiredReq)
    expect(expiredUser).toBeNull()

    // 3. Invalid / tampered Firebase token -> returns null
    const invalidReq = {
      headers: { authorization: 'Bearer test_firebase_token_invalid_bad' },
    }
    const invalidUser = await resolveAuthenticatedUser(invalidReq)
    expect(invalidUser).toBeNull()

    // 4. Spoofed X-Firebase-UID header alone without token MUST BE REJECTED (returns null)
    const spoofedReq = {
      headers: { 'x-firebase-uid': 'attacker_impersonated_victim_uid' },
    }
    const spoofedUser = await resolveAuthenticatedUser(spoofedReq)
    expect(spoofedUser).toBeNull()
  })
})

describe('Security: Access Control & Analysis Ownership Verification', () => {
  const app = express()
  app.use(express.json())
  app.use('/api', analyzeRouter)
  app.use('/api', prRouter)
  app.use('/api', downloadRouter)
  app.use('/api', qaRouter)
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

  it('returns 401 when spoofed x-firebase-uid is used without valid token', async () => {
    const res = await fetch(`${baseUrl}/api/analysis/${ownerAnalysisId}`, {
      headers: { 'x-firebase-uid': 'alice_owner' },
    })
    expect(res.status).toBe(401)
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

  it('prevents User B from downloading User A analysis scaffolds (returns 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attackerSessionId}`,
      },
      body: JSON.stringify({ analysisId: ownerAnalysisId }),
    })
    expect(res.status).toBe(403)
  })

  it('allows User A to download own analysis scaffolds (returns 200 ZIP)', async () => {
    const res = await fetch(`${baseUrl}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerSessionId}`,
      },
      body: JSON.stringify({ analysisId: ownerAnalysisId }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/zip')
  })

  it('prevents User B from asking QA on User A analysis (returns 403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/qa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attackerSessionId}`,
      },
      body: JSON.stringify({
        analysisId: ownerAnalysisId,
        question: 'What is the architectural debt?',
      }),
    })
    expect(res.status).toBe(403)
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
