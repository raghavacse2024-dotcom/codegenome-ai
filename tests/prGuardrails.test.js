import { describe, expect, it } from 'vitest'
import { validatePrGuardrails } from '../server/services/prGuardrails.js'

describe('Security: PR Safety Guardrails', () => {
  it('allows safe, standard TypeScript/JavaScript refactor scaffolds', () => {
    const files = [
      { path: 'src/features/userService.ts', content: 'export function getUser() { return { id: 1 }; }' },
      { path: 'src/features/userService.test.ts', content: 'import { describe, it } from "vitest";' },
    ]
    const patch = '@@ -1,3 +1,3 @@\n- oldCode\n+ newCode\n'

    const check = validatePrGuardrails({ files, patch })
    expect(check.passed).toBe(true)
    expect(check.violations).toHaveLength(0)
    expect(check.isHighRisk).toBe(false)
  })

  it('rejects PRs exceeding maximum file modification limit', () => {
    // 16 files exceeds max limit of 15
    const files = Array.from({ length: 16 }, (_, i) => ({
      path: `src/module_${i}.ts`,
      content: `export const val = ${i};`,
    }))

    const check = validatePrGuardrails({ files, patch: '+ line\n' })
    expect(check.passed).toBe(false)
    expect(check.violations.some((v) => v.includes('exceeds safety limit'))).toBe(true)
  })

  it('rejects PRs with excessive diff size', () => {
    // Diff with 1400 added lines exceeds 1200 limit
    const massivePatch = Array.from({ length: 1400 }, (_, i) => `+ line added ${i}`).join('\n')
    const files = [{ path: 'src/large.ts', content: 'large content' }]

    const check = validatePrGuardrails({ files, patch: massivePatch })
    expect(check.passed).toBe(false)
    expect(check.violations.some((v) => v.includes('exceeds maximum PR safety threshold'))).toBe(true)
  })

  it('blocks prohibited executable or sensitive file extensions (.sh, .exe, .env, .pem)', () => {
    const files = [
      { path: 'scripts/deploy.sh', content: '#!/bin/bash\necho deploy' },
      { path: 'config/.env', content: 'SECRET=123' },
    ]

    const check = validatePrGuardrails({ files })
    expect(check.passed).toBe(false)
    expect(check.violations.some((v) => v.includes('.sh'))).toBe(true)
    expect(check.violations.some((v) => v.includes('.env'))).toBe(true)
  })

  it('flags protected CI/CD workflows and deployment infrastructure as high risk', () => {
    const files = [
      { path: '.github/workflows/deploy.yml', content: 'name: Deploy\non: push\n' },
    ]

    const check = validatePrGuardrails({ files, confirmedHighRisk: false })
    expect(check.passed).toBe(false)
    expect(check.isHighRisk).toBe(true)
    expect(check.reason).toContain('High-risk changes detected')
  })
})
