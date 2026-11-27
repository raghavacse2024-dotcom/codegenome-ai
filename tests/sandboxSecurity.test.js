import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveExecutionProvider,
  buildHardenedDockerArgs,
  validateDockerArgs,
  assertAllowlistedCommand,
  filterExtraSandboxEnv,
  createSandboxWorkspace,
  writeSandboxFiles,
  cleanupSandboxWorkspace,
  executeInSandbox,
  resetDockerAvailabilityCache,
  setDockerProbeForTests,
} from '../server/services/sandboxExecutor.js'
import { SandboxJobManager } from '../server/services/sandboxJobManager.js'
import { validateRefactor } from '../server/services/refactorValidator.js'

describe('Production-Grade Sandbox Security Controls', () => {
  afterEach(() => {
    resetDockerAvailabilityCache()
    vi.restoreAllMocks()
  })

  it('1. rejects subprocess execution in production runtime', async () => {
    const res = await resolveExecutionProvider({
      mode: 'subprocess',
      isProduction: true,
    })

    expect(res.available).toBe(false)
    expect(res.provider).toBe('sandbox_unavailable')
    expect(res.reason).toMatch(/prohibited in production/i)
  })

  it('2. does not silently downgrade to subprocess when Docker is unavailable in production or strict docker mode', async () => {
    const prodAuto = await resolveExecutionProvider({
      mode: 'auto',
      isProduction: true,
      workerUrl: '',
      dockerProbe: async () => false,
    })
    expect(prodAuto.available).toBe(false)
    expect(prodAuto.provider).toBe('sandbox_unavailable')

    const strictDockerDev = await resolveExecutionProvider({
      mode: 'docker',
      isProduction: false,
      dockerProbe: async () => false,
    })
    expect(strictDockerDev.available).toBe(false)
    expect(strictDockerDev.provider).toBe('sandbox_unavailable')
    expect(strictDockerDev.reason).toMatch(/without subprocess downgrade/i)
  })

  it('3. enforces Docker network isolation, non-root user, read-only rootfs, and capability drops', () => {
    const workspace = '/tmp/codegenome-ws-test'
    const args = buildHardenedDockerArgs({
      resolvedWorkspace: workspace,
      dockerImage: 'node:22-alpine',
      command: 'node',
      args: ['--check', 'src/app.js'],
      limits: { maxCpus: 0.5, maxMemoryMb: 256, maxPids: 64 },
    })

    expect(args).toContain('--network=none')
    expect(args).toContain('--read-only')
    expect(args).toContain('--cap-drop=ALL')
    expect(args).toContain('--security-opt=no-new-privileges:true')
    expect(args).toContain('--cpus=0.5')
    expect(args).toContain('--memory=256m')
    expect(args).toContain('--memory-swap=256m')
    expect(args).toContain('--pids-limit=64')

    const userIdx = args.indexOf('--user')
    expect(userIdx).toBeGreaterThan(-1)
    expect(args[userIdx + 1]).toBe('65534:65534')

    // Verify validator rejects privileged, root, host mounts, and docker socket exposure
    expect(() => validateDockerArgs(['run', '--privileged', '--network=none'], workspace)).toThrow(/privilege/i)
    expect(() => validateDockerArgs(['run', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '-v', '/var/run/docker.sock:/var/run/docker.sock'], workspace)).toThrow(/docker socket/i)
    expect(() => validateDockerArgs(['run', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--user', '0:0'], workspace)).toThrow(/non-root/i)
  })

  it('4. rejects workspace path traversal attempts and unsafe file entries', () => {
    const ws = createSandboxWorkspace('cg-sec-trav-')
    try {
      expect(() => writeSandboxFiles(ws, [{ path: '../../etc/passwd', content: 'x' }])).toThrow(/Path traversal/)
      expect(() => writeSandboxFiles(ws, [{ path: 'src/../../../escape.js', content: 'x' }])).toThrow(/Path traversal/)
      expect(() => writeSandboxFiles(ws, [{ path: 'C:\\Windows\\win.ini', content: 'x' }])).toThrow(/Path traversal/)
      expect(() => writeSandboxFiles(ws, [{ path: 'bad\0file.js', content: 'x' }])).toThrow(/Invalid sandbox/)
    } finally {
      cleanupSandboxWorkspace(ws)
    }
  })

  it('5. blocks symbolic-link attacks from escaping the sandbox workspace', () => {
    const ws = createSandboxWorkspace('cg-sec-symlink-')
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-outside-'))
    try {
      const linkDir = path.join(ws, 'linked')
      fs.symlinkSync(outsideDir, linkDir, 'dir')

      expect(() =>
        writeSandboxFiles(ws, [{ path: 'linked/pwn.txt', content: 'escaped' }])
      ).toThrow(/Symbolic link/i)

      expect(fs.existsSync(path.join(outsideDir, 'pwn.txt'))).toBe(false)

      // Also block explicit symlink file entries
      expect(() =>
        writeSandboxFiles(ws, [{ path: 'badlink', content: '/etc/passwd', isSymlink: true }])
      ).toThrow(/Symbolic link/i)
    } finally {
      cleanupSandboxWorkspace(ws)
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('6. enforces file count, disk size, command allowlist, and per-user concurrency limits', async () => {
    const ws = createSandboxWorkspace('cg-sec-limits-')
    try {
      // File count cap
      const manyFiles = Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.txt`, content: 'ok' }))
      expect(() =>
        writeSandboxFiles(ws, manyFiles, { maxFiles: 5, maxWorkspaceBytes: 1024 * 1024 })
      ).toThrow(/file count limit/i)

      // Disk byte cap
      expect(() =>
        writeSandboxFiles(ws, [{ path: 'big.txt', content: 'a'.repeat(500) }], { maxFiles: 10, maxWorkspaceBytes: 100 })
      ).toThrow(/disk limit/i)
    } finally {
      cleanupSandboxWorkspace(ws)
    }

    // Command allowlist rejects shell/package-manager/arbitrary execution
    expect(() => assertAllowlistedCommand('sh', ['-c', 'id'])).toThrow(/allowlist/i)
    expect(() => assertAllowlistedCommand('npm', ['install'])).toThrow(/allowlist/i)
    expect(() => assertAllowlistedCommand('node; rm -rf /', [])).toThrow(/unsafe sandbox command/i)

    // Per-user concurrency cap
    const mgr = new SandboxJobManager()
    let releaseFirst
    const firstGate = new Promise((r) => {
      releaseFirst = r
    })
    const job1 = mgr.runJob({ userId: 'gh_42', limits: { maxUserJobs: 1, maxConcurrentJobs: 2 } }, () => firstGate)
    await expect(
      mgr.runJob({ userId: 'gh_42', limits: { maxUserJobs: 1, maxConcurrentJobs: 2 } }, async () => 'blocked')
    ).rejects.toThrow(/concurrency limit/i)
    releaseFirst('done')
    expect(await job1).toBe('done')
  })

  it('7. terminates timed-out execution processes and cleans up', async () => {
    const ws = createSandboxWorkspace('cg-sec-timeout-')
    try {
      const res = await executeInSandbox({
        workspaceDir: ws,
        command: 'node',
        args: ['-e', 'setTimeout(() => console.log("never"), 10000)'],
        timeoutMs: 200,
        providerOverride: { available: true, provider: 'trusted-dev-subprocess', reason: 'test' },
      })

      expect(res.timedOut).toBe(true)
      expect(res.exitCode).toBe(124)
      expect(res.stderr).toMatch(/timed out/i)
    } finally {
      cleanupSandboxWorkspace(ws)
    }
    expect(fs.existsSync(ws)).toBe(false)
  })

  it('8. caps stdout and stderr at maxOutputBytes', async () => {
    const ws = createSandboxWorkspace('cg-sec-output-')
    try {
      const res = await executeInSandbox({
        workspaceDir: ws,
        command: 'node',
        args: ['-e', 'process.stdout.write("A".repeat(20000)); process.stderr.write("B".repeat(20000));'],
        maxOutputBytes: 512,
        providerOverride: { available: true, provider: 'trusted-dev-subprocess', reason: 'test' },
      })

      expect(res.exitCode).toBe(0)
      expect(res.stdout.length).toBeLessThanOrEqual(512)
      expect(res.stderr.length).toBeLessThanOrEqual(512)
    } finally {
      cleanupSandboxWorkspace(ws)
    }
  })

  it('9. never exposes application secrets to sandboxed processes or extraEnv', async () => {
    const prevEnv = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      SESSION_ENCRYPTION_KEY: process.env.SESSION_ENCRYPTION_KEY,
    }
    process.env.GEMINI_API_KEY = 'secret_gemini_key'
    process.env.GITHUB_CLIENT_SECRET = 'secret_gh_oauth'
    process.env.OPENAI_API_KEY = 'sk-secret-openai'
    process.env.SESSION_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    const filtered = filterExtraSandboxEnv({
      PYTHONPATH: '.',
      GEMINI_API_KEY: 'leak',
      MY_SECRET_TOKEN: 'leak',
      AWS_ACCESS_KEY_ID: 'leak',
    })
    expect(filtered).toEqual({ PYTHONPATH: '.' })

    const ws = createSandboxWorkspace('cg-sec-env-')
    try {
      const res = await executeInSandbox({
        workspaceDir: ws,
        command: 'node',
        args: [
          '-e',
          'console.log(JSON.stringify({ g: process.env.GEMINI_API_KEY || null, gh: process.env.GITHUB_CLIENT_SECRET || null, oa: process.env.OPENAI_API_KEY || null, se: process.env.SESSION_ENCRYPTION_KEY || null }))',
        ],
        extraEnv: { GEMINI_API_KEY: 'override_leak', PYTHONPATH: '.' },
        providerOverride: { available: true, provider: 'trusted-dev-subprocess', reason: 'test' },
      })
      const parsed = JSON.parse(res.stdout.trim())
      expect(parsed).toEqual({ g: null, gh: null, oa: null, se: null })
    } finally {
      cleanupSandboxWorkspace(ws)
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })

  it('10. removes temporary sandbox workspaces even after validation failures or exceptions', async () => {
    const beforeEntries = new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('codegenome-sbx_')))

    const failedResult = await validateRefactor({
      files: [{ path: 'src/broken.ts', content: 'export const x = (;' }],
      targetPath: 'src/broken.ts',
    })
    expect(failedResult.state).toBe('VALIDATION_FAILED')

    const traversalResult = await validateRefactor({
      files: [{ path: '../../outside.ts', content: 'export const a = 1;' }],
      targetPath: '../../outside.ts',
    })
    expect(traversalResult.state).toBe('VALIDATION_FAILED')

    const afterEntries = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('codegenome-sbx_') && !beforeEntries.has(n))
    expect(afterEntries).toHaveLength(0)
  })

  it('11. returns explicit SANDBOX_UNAVAILABLE state and never marks unexecuted checks PASSED when sandbox is unavailable', async () => {
    setDockerProbeForTests(async () => false)

    const result = await validateRefactor({
      files: [
        { path: 'src/calc.py', content: 'def add(a, b):\n    return a + b\n' },
        {
          path: 'tests/test_calc.py',
          content: 'import unittest\nfrom src.calc import add\nclass T(unittest.TestCase):\n    def test_add(self): self.assertEqual(add(1, 2), 3)\n',
        },
      ],
      targetPath: 'src/calc.py',
      baseFiles: [
        { path: 'setup.cfg', content: '[unittest]\ntest_runner = unittest\n' },
        { path: 'CONTRIBUTING.md', content: 'Automated PRs welcome.' },
      ],
      simulateExecution: true, // Even if caller sets simulateExecution, unavailable sandbox must NOT become PASSED!
      providerOverride: {
        available: false,
        provider: 'sandbox_unavailable',
        reason: 'Docker daemon unavailable in production fail-closed mode.',
      },
    })

    expect(result.sandboxAvailable).toBe(false)
    expect(result.sandboxStatus).toBe('SANDBOX_UNAVAILABLE')
    expect(result.executionEnvironment).toBe('sandbox_unavailable')
    expect(result.state).toBe('SANDBOX_UNAVAILABLE')
    expect(result.status).toBe('sandbox_unavailable')
    expect(result.validation.safeToPropose).toBe(false)
    expect(result.validation.tests).toBe('sandbox_unavailable')
    expect(result.validation.build).toBe('sandbox_unavailable')
    expect(result.validationBreakdown.sandboxAvailability).toBe('sandbox_unavailable')
    expect(result.validationBreakdown.testsExecuted).toBe('sandbox_unavailable')
    expect(result.validationBreakdown.buildExecuted).toBe('sandbox_unavailable')
  })

  it('12. executes safely via mocked Docker provider and HTTPS remote worker without requiring a live daemon', async () => {
    // Verify mocked remote worker execution works and handles worker errors cleanly
    const ws = createSandboxWorkspace('cg-sec-remote-')
    try {
      writeSandboxFiles(ws, [{ path: 'src/mod.mjs', content: 'export const ok = true;\n' }])
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ exitCode: 0, stdout: 'remote syntax ok', stderr: '', timedOut: false, durationMs: 25 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      const remoteRes = await executeInSandbox({
        workspaceDir: ws,
        command: 'node',
        args: ['--check', 'src/mod.mjs'],
        providerOverride: {
          available: true,
          provider: 'remote-worker',
          workerUrl: 'https://sandbox.example.com',
          reason: 'Remote worker',
        },
        fetchImpl: mockFetch,
      })

      expect(remoteRes.exitCode).toBe(0)
      expect(remoteRes.executionEnvironment).toBe('remote-worker')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Failed remote worker never pretends execution passed
      const failFetch = vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 }))
      const failedRemote = await executeInSandbox({
        workspaceDir: ws,
        command: 'node',
        args: ['--check', 'src/mod.mjs'],
        providerOverride: {
          available: true,
          provider: 'remote-worker',
          workerUrl: 'https://sandbox.example.com',
          reason: 'Remote worker',
        },
        fetchImpl: failFetch,
      })
      expect(failedRemote.exitCode).not.toBe(0)
      expect(failedRemote.unavailable).toBe(true)
      expect(failedRemote.executionEnvironment).toBe('sandbox_unavailable')
    } finally {
      cleanupSandboxWorkspace(ws)
    }
  })
})
