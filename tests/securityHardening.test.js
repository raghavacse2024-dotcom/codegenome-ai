import { describe, expect, it } from 'vitest'
import express from 'express'
import http from 'node:http'
import {
  isPrivateOrReservedIp,
  assertSafeExternalUrl,
  assertSafeGitHubUrl,
  validateRepoSegment,
  validateGitBranchName,
  sanitizeRepoFilePath,
} from '../server/services/urlSecurity.js'
import { isAllowedOrigin } from '../server/index.js'
import { prRateLimiter } from '../server/middleware/rateLimiter.js'
import { createPullRequest } from '../server/services/prService.js'

describe('Security Hardening: SSRF, Input Validation, CORS & Rate Limiting', () => {
  it('blocks private, loopback, link-local, and cloud metadata IP addresses', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true)
    expect(isPrivateOrReservedIp('172.16.4.2')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.10')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedIp('::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)
    expect(isPrivateOrReservedIp('140.82.121.4')).toBe(false)
  })

  it('rejects non-GitHub URLs, credentials in URLs, and localhost SSRF attempts', () => {
    expect(() => assertSafeGitHubUrl('http://127.0.0.1:8080/owner/repo')).toThrow()
    expect(() => assertSafeGitHubUrl('https://127.0.0.1/owner/repo')).toThrow()
    expect(() => assertSafeGitHubUrl('https://169.254.169.254/latest/meta-data')).toThrow()
    expect(() => assertSafeGitHubUrl('https://user:pass@github.com/owner/repo')).toThrow()
    expect(() => assertSafeGitHubUrl('https://evil.example.com/owner/repo')).toThrow()
    expect(() => assertSafeExternalUrl('http://localhost:3000/test')).toThrow()
  })

  it('validates repository owner, repository name, branch names, and file paths against injection/traversal', () => {
    expect(validateRepoSegment('expressjs', 'owner')).toBe('expressjs')
    expect(() => validateRepoSegment('../evil', 'owner')).toThrow()
    expect(() => validateRepoSegment('owner;rm -rf', 'owner')).toThrow()

    expect(validateGitBranchName('codegenome/refactor/auth-1')).toBe('codegenome/refactor/auth-1')
    expect(() => validateGitBranchName('main..evil')).toThrow()
    expect(() => validateGitBranchName('branch with spaces')).toThrow()
    expect(() => validateGitBranchName('bad~ref^2')).toThrow()

    expect(sanitizeRepoFilePath('/src/app.ts')).toBe('src/app.ts')
    expect(sanitizeRepoFilePath('../../secret.env')).toBeNull()
  })

  it('rejects invalid branch names inside createPullRequest', async () => {
    await expect(
      createPullRequest({
        owner: 'acme',
        repository: 'app',
        branch: 'bad..branch/../../../etc',
        files: [{ path: 'src/a.ts', content: 'export const a = 1;' }],
      })
    ).rejects.toThrow(/Invalid Git branch name/)
  })

  it('enforces CORS origin allowlist cleanly', () => {
    expect(isAllowedOrigin(undefined)).toBe(true)
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedOrigin('https://codegenome-ai.vercel.app')).toBe(true)
    expect(isAllowedOrigin('https://untrusted-phishing-site.com')).toBe(false)
    expect(isAllowedOrigin('javascript:alert(1)')).toBe(false)
  })

  it('enforces sliding-window rate limits with HTTP 429 when exceeded', async () => {
    const app = express()
    app.post('/limited', prRateLimiter, (_req, res) => res.json({ ok: true }))
    const server = http.createServer(app)
    await new Promise((resolve) => server.listen(0, resolve))
    const port = server.address().port

    try {
      let saw429 = false
      for (let i = 0; i < 18; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/limited`, {
          method: 'POST',
          headers: { 'x-test-rate-limit': 'enforce' },
        })
        if (res.status === 429) {
          saw429 = true
          break
        }
      }
      expect(saw429).toBe(true)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
