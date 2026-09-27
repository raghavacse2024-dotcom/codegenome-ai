import { describe, expect, it } from 'vitest'
import { redactSecrets, isSensitiveFile, redactRepositoryFiles } from '../server/services/secretRedactor.js'

describe('Security: Secret Detection & Redaction', () => {
  it('redacts OpenAI API keys', () => {
    const raw = 'const key = "sk-proj-abc1234567890abcdef1234567890abcdef1234567890";'
    const redacted = redactSecrets(raw)
    expect(redacted).not.toContain('sk-proj-')
    expect(redacted).toContain('[REDACTED_OPENAI_KEY]')
  })

  it('redacts GitHub Personal Access Tokens and Fine-grained tokens', () => {
    const rawClassic = 'git_token: ghp_1234567890abcdefghijklmnopqrstuvwxyz12'
    const rawFineGrained = 'token: github_pat_11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyz01234567890123456789'

    const red1 = redactSecrets(rawClassic)
    const red2 = redactSecrets(rawFineGrained)

    expect(red1).not.toContain('ghp_1234567890')
    expect(red1).toContain('[REDACTED_GITHUB_TOKEN]')

    expect(red2).not.toContain('github_pat_11AAAAAAA')
    expect(red2).toContain('[REDACTED_GITHUB_TOKEN]')
  })

  it('redacts GitLab Personal Access Tokens', () => {
    const rawGitLab = 'gitlab_token = "glpat-abcdef1234567890_XYZW"'
    const redacted = redactSecrets(rawGitLab)
    expect(redacted).not.toContain('glpat-abcdef1234567890_XYZW')
    expect(redacted).toContain('[REDACTED_GITLAB_TOKEN]')
  })

  it('redacts AWS Access Key ID and Secret Access Key', () => {
    const raw = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    const redacted = redactSecrets(raw)

    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(redacted).toContain('[REDACTED_AWS_ACCESS_KEY]')
    expect(redacted).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
    expect(redacted).toContain('[REDACTED_AWS_SECRET]')
  })

  it('redacts RSA / EC Private Keys', () => {
    const raw = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----`
    const redacted = redactSecrets(raw)
    expect(redacted).not.toContain('MIIEowIBAAKCAQEA0Y1+abcdefghijklmnopqrstuvwxyz')
    expect(redacted).toContain('[REDACTED_PRIVATE_KEY]')
  })

  it('redacts database passwords in connection URLs', () => {
    const raw = 'DATABASE_URL="postgres://admin:SuperSecretPass123!@db.production.internal:5432/main"'
    const redacted = redactSecrets(raw)
    expect(redacted).not.toContain('SuperSecretPass123!')
    expect(redacted).toContain('postgres://admin:[REDACTED_PASSWORD]@db.production.internal:5432/main')
  })

  it('redacts JSON Web Tokens (JWT)', () => {
    const raw = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const redacted = redactSecrets(raw)
    expect(redacted).not.toContain('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
    expect(redacted).toContain('[REDACTED_JWT]')
  })

  it('correctly identifies and filters sensitive files from repository ingestion', () => {
    expect(isSensitiveFile('.env')).toBe(true)
    expect(isSensitiveFile('.env.production')).toBe(true)
    expect(isSensitiveFile('.env.local')).toBe(true)
    expect(isSensitiveFile('server/keys/private.pem')).toBe(true)
    expect(isSensitiveFile('id_rsa')).toBe(true)
    expect(isSensitiveFile('credentials.json')).toBe(true)
    expect(isSensitiveFile('service-account.json')).toBe(true)

    // Standard source files should not be flagged as sensitive
    expect(isSensitiveFile('src/index.ts')).toBe(false)
    expect(isSensitiveFile('server/index.js')).toBe(false)
    expect(isSensitiveFile('package.json')).toBe(false)
  })

  it('filters sensitive files and redacts secrets in repository file collections', () => {
    const files = [
      { path: '.env', content: 'SECRET=supersecret123' },
      { path: 'src/main.ts', content: 'const apiKey = "sk-proj-abc1234567890abcdef1234567890abcdef1234567890";' },
      { path: 'src/util.ts', content: 'export const add = (a, b) => a + b;' },
    ]

    const sanitized = redactRepositoryFiles(files)

    // .env should be excluded
    expect(sanitized.some((f) => f.path === '.env')).toBe(false)
    expect(sanitized.length).toBe(2)

    // src/main.ts should have its secret redacted
    const mainFile = sanitized.find((f) => f.path === 'src/main.ts')
    expect(mainFile?.content).toContain('[REDACTED_OPENAI_KEY]')
  })
})
