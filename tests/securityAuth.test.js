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
import { resolveAuthenticatedUser, getCanonicalUserId, assertAnalysisOwnership } from '../server/services/authResolver.js'
import { getAppOrigin } from '../server/index.js'
import { inspectContributionPolicy } from '../server/services/contributionPolicyService.js'

describe('Security: Cryptographic Firebase Token & Identity Verification', () => {
  it('1. verifies valid Firebase ID token and resolves authenticated user', async () => {
    const validReq = {
      headers: { authorization: 'Bearer test_firebase_token_firebase_user_123' },
    }
    const validUser = await resolveAuthenticatedUser(validReq)
    expect(validUser).toBeDefined()
    expect(validUser.authenticated).toBe(true)
    expect(validUser.userId).toBe('firebase_user_123')
    expect(validUser.firebaseUid).toBe('firebase_user_123')
    expect(validUser.provider).toBe('firebase')
  })

  it('2. rejects expired Firebase ID token with null (401 unauthenticated)', async () => {
    const expiredReq = {
      headers: { authorization: 'Bearer test_firebase_token_expired_999' },
    }
    const expiredUser = await resolveAuthenticatedUser(expiredReq)
    expect(expiredUser).toBeNull()
  })

  it('3. rejects invalid Firebase ID token with null', async () => {
    const invalidReq = {
      headers: { authorization: 'Bearer test_firebase_token_invalid_bad' },
    }
    const invalidUser = await resolveAuthenticatedUser(invalidReq)
    expect(invalidUser).toBeNull()
  })

  it('4. rejects tampered Firebase ID token with null', async () => {
    const tamperedReq = {
      headers: { authorization: 'Bearer test_firebase_token_tampered_header' },
    }
    const tamperedUser = await resolveAuthenticatedUser(tamperedReq)
    expect(tamperedUser).toBeNull()
  })

  it('5. rejects unsigned/fake unverified JWT with null', async () => {
    // Unsigned fake JWT: header.payload.fake_signature
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'fake_uid_attacker', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
    const fakeJwt = `${header}.${payload}.`

    const fakeReq = {
      headers: { authorization: `Bearer ${fakeJwt}` },
    }
    const fakeUser = await resolveAuthenticatedUser(fakeReq)
    expect(fakeUser).toBeNull()
  })

  it('6. ignores fake x-firebase-uid header without valid token', async () => {
    const spoofedReq = {
      headers: { 'x-firebase-uid': 'attacker_impersonated_victim_uid' },
    }
    const spoofedUser = await resolveAuthenticatedUser(spoofedReq)
    expect(spoofedUser).toBeNull()
  })

  it('7. rejects cg_google_fake_uid client session alias', async () => {
    const googleAliasReq = {
      headers: { authorization: 'Bearer cg_google_fake_uid_123' },
    }
    const aliasUser = await resolveAuthenticatedUser(googleAliasReq)
    expect(aliasUser).toBeNull()
  })

  it('8. rejects invalid GitHub PAT (returns null / 401)', async () => {
    const invalidPatReq = {
      headers: { 'x-github-token': 'ghp_invalid_fake_token_value_xyz' },
    }
    const patUser = await resolveAuthenticatedUser(invalidPatReq)
    expect(patUser).toBeNull()
  })

  it('9. never uses token_user as userId or login', async () => {
    const invalidPatReq = {
      headers: { authorization: 'Bearer ghp_invalid_fake_pat_token' },
    }
    const user = await resolveAuthenticatedUser(invalidPatReq)
    if (user) {
      expect(user.userId).not.toBe('token_user')
      expect(user.githubLogin).not.toBe('token_user')
    } else {
      expect(user).toBeNull()
    }
  })

  it('10. derives canonical user ID only from verified identities', () => {
    expect(getCanonicalUserId({ firebaseUid: 'fb_123' })).toBe('fb_123')
    expect(getCanonicalUserId({ githubUserId: '987654' })).toBe('gh_987654')
    expect(getCanonicalUserId({ user: { id: 5555 } })).toBe('gh_5555')
  })

  it('11. prevents client-provided userId or login from overriding verified identity', () => {
    const identity = {
      firebaseUid: 'verified_fb_uid',
      userId: 'attacker_custom_id',
      githubLogin: 'attacker_login',
    }
    expect(getCanonicalUserId(identity)).toBe('verified_fb_uid')
  })

  it('12. validates postMessage target origin cleanly via getAppOrigin', () => {
    const req = { headers: { origin: 'https://codegenome.ai' } }
    expect(getAppOrigin(req)).toBe('https://codegenome.ai')
  })

  it('13. classifies contribution policy as ALLOWED, BLOCKED, or UNKNOWN', () => {
    // No policy files -> UNKNOWN
    const unknownRes = inspectContributionPolicy([])
    expect(unknownRes.status).toBe('UNKNOWN')
    expect(unknownRes.isBlocked).toBe(false)

    // Policy with AI PR ban -> BLOCKED
    const blockedRes = inspectContributionPolicy([
      { path: 'AGENTS.md', content: 'No AI-generated PRs allowed here.' }
    ])
    expect(blockedRes.status).toBe('BLOCKED')
    expect(blockedRes.isBlocked).toBe(true)

    // Policy permitting PRs -> ALLOWED
    const allowedRes = inspectContributionPolicy([
      { path: 'CONTRIBUTING.md', content: 'Contributions and pull requests are welcome!' }
    ])
    expect(allowedRes.status).toBe('ALLOWED')
    expect(allowedRes.isBlocked).toBe(false)
  })
})

describe('Security: Session Store & Encryption', () => {
  it('generates non-predictable session IDs with cg_sess_ prefix', () => {
    const session = sessionStore.createSession({ token: 'test-token', userId: 'gh_1001', user: { id: 1001, login: 'testuser' } })
    expect(session.sessionId).toMatch(/^cg_sess_[a-f0-9]{64}$/)
    expect(session.userId).toBe('gh_1001')
  })

  it('persists tokens encrypted with AES-256-GCM', () => {
    const secretToken = 'ghp_secret_token_value_never_plaintext'
    const session = sessionStore.createSession({ token: secretToken, userId: 'gh_2002', user: { id: 2002 } })
    sessionStore.save()

    if (fs.existsSync(sessionStore.filePath)) {
      const rawDisk = fs.readFileSync(sessionStore.filePath, 'utf8')
      expect(rawDisk).not.toContain(secretToken)
      const parsed = JSON.parse(rawDisk)
      expect(parsed[session.sessionId]?.token).toMatch(/^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/)
    }
  })

  it('prevents OAuth state replay and reuse', () => {
    const state = sessionStore.createOAuthState({ redirect: '/dashboard' })
    expect(sessionStore.validateAndConsumeOAuthState(state)).toBe(true)
    expect(sessionStore.validateAndConsumeOAuthState(state)).toBe(false)
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
      user: { id: 111, login: 'alice_owner' },
    })
    ownerSessionId = ownerSession.sessionId

    // Setup attacker session
    const attackerSession = sessionStore.createSession({
      token: 'attacker-token',
      userId: 'bob_attacker',
      user: { id: 222, login: 'bob_attacker' },
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

  it('13. User A can access own analysis', async () => {
    const res = await fetch(`${baseUrl}/api/analysis/${ownerAnalysisId}`, {
      headers: { Authorization: `Bearer ${ownerSessionId}` },
    })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.analysisId).toBe(ownerAnalysisId)
  })

  it('14. User B cannot access User A analysis (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/analysis/${ownerAnalysisId}`, {
      headers: { Authorization: `Bearer ${attackerSessionId}` },
    })
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('FORBIDDEN')
  })

  it('15. User B cannot download User A analysis scaffolds (403 Forbidden)', async () => {
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

  it('16. User B cannot access User A QA endpoint (403 Forbidden)', async () => {
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

  it('17. User B cannot access User A patch (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/pr/patch/${ownerAnalysisId}`, {
      headers: { Authorization: `Bearer ${attackerSessionId}` },
    })
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('FORBIDDEN')
  })

  it('18. User B cannot create PR from User A analysis (403 Forbidden)', async () => {
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
})
