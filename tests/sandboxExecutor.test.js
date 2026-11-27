import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createSandboxWorkspace,
  writeSandboxFiles,
  cleanupSandboxWorkspace,
  executeInSandbox,
} from '../server/services/sandboxExecutor.js'
import { validateRefactor } from '../server/services/refactorValidator.js'

describe('Isolated Sandbox Executor', () => {
  it('strips sensitive application environment variables inside sandbox execution', async () => {
    const prevGemini = process.env.GEMINI_API_KEY
    const prevGithubSecret = process.env.GITHUB_CLIENT_SECRET
    process.env.GEMINI_API_KEY = 'AIza_SUPER_SECRET_SHOULD_NOT_LEAK'
    process.env.GITHUB_CLIENT_SECRET = 'gh_secret_should_never_leak'

    const workspaceDir = createSandboxWorkspace('cg-test-env-')
    try {
      const result = await executeInSandbox({
        workspaceDir,
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ gemini: process.env.GEMINI_API_KEY || null, gh: process.env.GITHUB_CLIENT_SECRET || null }))'],
      })

      expect(result.exitCode).toBe(0)
      const parsed = JSON.parse(result.stdout.trim())
      expect(parsed.gemini).toBeNull()
      expect(parsed.gh).toBeNull()
    } finally {
      cleanupSandboxWorkspace(workspaceDir)
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = prevGemini
      if (prevGithubSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET
      else process.env.GITHUB_CLIENT_SECRET = prevGithubSecret
    }

    expect(fs.existsSync(workspaceDir)).toBe(false)
  })

  it('enforces execution timeout and terminates runaway processes cleanly', async () => {
    const workspaceDir = createSandboxWorkspace('cg-test-timeout-')
    try {
      const result = await executeInSandbox({
        workspaceDir,
        command: 'node',
        args: ['-e', 'setTimeout(() => console.log("done"), 5000)'],
        timeoutMs: 250,
      })

      expect(result.timedOut).toBe(true)
      expect(result.exitCode).toBe(124)
      expect(result.stderr).toContain('timed out')
    } finally {
      cleanupSandboxWorkspace(workspaceDir)
    }
  })

  it('blocks path traversal attempts in writeSandboxFiles', () => {
    const workspaceDir = createSandboxWorkspace('cg-test-traversal-')
    try {
      expect(() =>
        writeSandboxFiles(workspaceDir, [{ path: '../../etc/passwd', content: 'x' }])
      ).toThrow(/Path traversal/)
    } finally {
      cleanupSandboxWorkspace(workspaceDir)
    }
  })

  it('captures genuine test failure in Python unittest inside validateRefactor', async () => {
    const files = [
      {
        path: 'src/math_mod.py',
        content: 'def multiply(a, b):\n    return a + b\n',
      },
      {
        path: 'tests/test_math_mod.py',
        content: `import unittest
from src.math_mod import multiply

class TestMath(unittest.TestCase):
    def test_multiply(self):
        self.assertEqual(multiply(3, 4), 12)
`,
      },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/math_mod.py',
      baseFiles: [
        { path: 'CONTRIBUTING.md', content: 'PRs welcome' },
        { path: 'setup.cfg', content: '[unittest]\ntest_runner = unittest\n' },
      ],
    })

    expect(result.status).toBe('validation_failed')
    expect(result.state).toBe('VALIDATION_FAILED')
    expect(result.validation.build).toBe('passed')
    expect(result.validation.tests).toBe('failed')
    expect(result.failedStep).toBe('tests')
    expect(result.validation.safeToPropose).toBe(false)
  })

  it('executes passing node:test suite natively in isolated sandbox without external deps', async () => {
    const files = [
      {
        path: 'src/greet.mjs',
        content: 'export function greet(name) { return `Hello, ${name}!`; }\n',
      },
      {
        path: 'src/greet.test.mjs',
        content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { greet } from './greet.mjs';

test('greet formats name', () => {
  assert.equal(greet('World'), 'Hello, World!');
});
`,
      },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/greet.mjs',
      baseFiles: [{ path: 'CONTRIBUTING.md', content: 'PRs welcome' }],
    })

    expect(result.validation.lint).toBe('passed')
    expect(result.validation.build).toBe('passed')
    expect(result.validation.tests).toBe('passed')
    expect(result.state).toBe('PR_ELIGIBLE')
    expect(result.validation.safeToPropose).toBe(true)
    expect(result.validationBreakdown.testsExecuted).toBe('passed')
    expect(result.validationBreakdown.buildExecuted).toBe('passed')
  })

  it('marks tests as skipped when refactor contains no test files', async () => {
    const files = [
      {
        path: 'src/solo.py',
        content: 'def identity(x):\n    return x\n',
      },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/solo.py',
      baseFiles: [{ path: 'CONTRIBUTING.md', content: 'PRs welcome' }],
    })

    expect(result.validation.build).toBe('passed')
    expect(result.validation.tests).toBe('skipped')
    expect(result.validationBreakdown.testsExecuted).toBe('skipped')
    expect(result.validation.safeToPropose).toBe(false)
    expect(result.state).toBe('HUMAN_REVIEW_REQUIRED')
  })
})
