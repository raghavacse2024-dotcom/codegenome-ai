import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_OUTPUT_BYTES = 32_768
const DEFAULT_MAX_WORKSPACE_BYTES = 10 * 1024 * 1024 // 10 MB

let cachedDockerCheck = null

/**
 * Checks whether a Docker daemon is reachable on the host.
 * Result is cached for 60 seconds to avoid repeated daemon probes.
 * @returns {Promise<boolean>}
 */
export async function isDockerAvailable() {
  const mode = (process.env.SANDBOX_MODE || 'auto').toLowerCase()
  if (mode === 'subprocess' || mode === 'disabled') return false

  const now = Date.now()
  if (cachedDockerCheck && now - cachedDockerCheck.checkedAt < 60_000) {
    return cachedDockerCheck.available
  }

  try {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 2_000 })
    cachedDockerCheck = { available: true, checkedAt: now }
    return true
  } catch {
    cachedDockerCheck = { available: false, checkedAt: now }
    return false
  }
}

/**
 * Resets cached Docker availability check (for tests).
 */
export function resetDockerAvailabilityCache() {
  cachedDockerCheck = null
}

/**
 * Builds a minimal, secret-free environment for isolated subprocess execution.
 * Explicitly omits application secrets (API keys, OAuth secrets, Firebase keys, tokens).
 * @param {string} workspaceDir
 * @returns {Record<string, string>}
 */
export function buildSanitizedSandboxEnv(workspaceDir) {
  const safePath = process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
  return {
    PATH: safePath,
    HOME: workspaceDir,
    TMPDIR: workspaceDir,
    TEMP: workspaceDir,
    TMP: workspaceDir,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
    NODE_OPTIONS: '--max-old-space-size=256',
    CODEGENOME_SANDBOX: '1',
    // Block standard proxy-aware HTTP clients inside subprocess fallback
    HTTP_PROXY: 'http://127.0.0.1:0',
    HTTPS_PROXY: 'http://127.0.0.1:0',
    ALL_PROXY: 'http://127.0.0.1:0',
    NO_PROXY: '',
  }
}

/**
 * Computes total byte size of all regular files inside a workspace directory.
 */
export function measureWorkspaceBytes(dirPath) {
  let total = 0
  if (!fs.existsSync(dirPath)) return 0

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += measureWorkspaceBytes(full)
    } else if (entry.isFile()) {
      total += fs.statSync(full).size
    }
  }
  return total
}

/**
 * Resolves a realpath-verified workspace path and prevents path traversal.
 */
export function writeSandboxFiles(workspaceDir, files = []) {
  const resolvedRoot = path.resolve(workspaceDir)
  let totalBytes = 0

  for (const f of files) {
    if (!f || typeof f.path !== 'string') continue
    const cleanPath = f.path.replace(/^\/+/, '').replace(/\\/g, '/')
    if (!cleanPath || cleanPath.includes('\0')) {
      throw new Error(`Invalid sandbox file path: ${f.path}`)
    }
    const fullPath = path.resolve(resolvedRoot, cleanPath)
    if (fullPath !== resolvedRoot && !fullPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Path traversal detected in refactor file: ${f.path}`)
    }
    const content = f.content !== undefined ? String(f.content) : (f.newContent !== undefined ? String(f.newContent) : '')
    totalBytes += Buffer.byteLength(content, 'utf8')
    if (totalBytes > DEFAULT_MAX_WORKSPACE_BYTES) {
      throw new Error(`Sandbox disk limit exceeded (${DEFAULT_MAX_WORKSPACE_BYTES} bytes).`)
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf8')
  }

  return totalBytes
}

/**
 * Creates a temporary isolated sandbox directory.
 */
export function createSandboxWorkspace(prefix = 'codegenome-sandbox-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/**
 * Cleans up an isolated sandbox directory cleanly.
 */
export function cleanupSandboxWorkspace(workspaceDir) {
  if (!workspaceDir) return
  try {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup race errors
  }
}

/**
 * Executes a single command inside either a resource-capped Docker container (--network=none)
 * or a secret-stripped OS subprocess sandbox.
 *
 * @param {object} options
 * @param {string} options.workspaceDir
 * @param {string} options.command
 * @param {string[]} [options.args=[]]
 * @param {string} [options.dockerImage]
 * @param {number} [options.timeoutMs=8000]
 * @param {number} [options.maxOutputBytes=32768]
 * @param {Record<string, string>} [options.extraEnv={}]
 * @returns {Promise<{
 *   exitCode: number | null,
 *   stdout: string,
 *   stderr: string,
 *   timedOut: boolean,
 *   durationMs: number,
 *   executionEnvironment: 'docker' | 'isolated-subprocess',
 *   error?: string
 * }>}
 */
export async function executeInSandbox({
  workspaceDir,
  command,
  args = [],
  dockerImage = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  extraEnv = {},
}) {
  const startedAt = Date.now()
  const resolvedWorkspace = path.resolve(workspaceDir)
  const workspaceBytes = measureWorkspaceBytes(resolvedWorkspace)
  if (workspaceBytes > DEFAULT_MAX_WORKSPACE_BYTES) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Sandbox disk limit exceeded (${workspaceBytes} bytes > ${DEFAULT_MAX_WORKSPACE_BYTES} bytes).`,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      executionEnvironment: 'isolated-subprocess',
      error: 'Workspace disk limit exceeded',
    }
  }

  const useDocker = Boolean(dockerImage) && (await isDockerAvailable())
  const executionEnvironment = useDocker ? 'docker' : 'isolated-subprocess'

  let spawnCmd = command
  let spawnArgs = args
  let spawnEnv = { ...buildSanitizedSandboxEnv(resolvedWorkspace), ...extraEnv }

  if (useDocker) {
    spawnCmd = 'docker'
    const envArgs = []
    for (const [k, v] of Object.entries(extraEnv)) {
      if (/^[A-Z0-9_]+$/i.test(k) && !/KEY|SECRET|TOKEN|PASS/i.test(k)) {
        envArgs.push('-e', `${k}=${v}`)
      }
    }
    spawnArgs = [
      'run',
      '--rm',
      '--network=none',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '--cpus=0.5',
      '--memory=256m',
      '--pids-limit=64',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '-v', `${resolvedWorkspace}:/workspace:rw`,
      '-w', '/workspace',
      ...envArgs,
      dockerImage,
      command,
      ...args,
    ]
    spawnEnv = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' }
  }

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let killTimer = null

    let child
    try {
      child = spawn(spawnCmd, spawnArgs, {
        cwd: resolvedWorkspace,
        shell: false,
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      return resolve({
        exitCode: 127,
        stdout: '',
        stderr: err.message,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        executionEnvironment,
        error: err.message,
      })
    }

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGTERM')
      } catch {}
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
      }, 500)
      if (killTimer.unref) killTimer.unref()
    }, timeoutMs)
    if (timeoutTimer.unref) timeoutTimer.unref()

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < maxOutputBytes) {
        stdout += chunk.toString('utf8').slice(0, maxOutputBytes - stdout.length)
      }
    })

    child.stderr?.on('data', (chunk) => {
      if (stderr.length < maxOutputBytes) {
        stderr += chunk.toString('utf8').slice(0, maxOutputBytes - stderr.length)
      }
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      resolve({
        exitCode: 127,
        stdout,
        stderr: stderr || err.message,
        timedOut,
        durationMs: Date.now() - startedAt,
        executionEnvironment,
        error: err.message,
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr: timedOut ? `${stderr}\nExecution timed out after ${timeoutMs}ms.`.trim() : stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
        executionEnvironment,
      })
    })
  })
}

async function hasBinary(binName) {
  try {
    await execFileAsync('which', [binName], { timeout: 1500 })
    return true
  } catch {
    return false
  }
}

function getLocalTscPath() {
  const localTsc = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsc')
  return fs.existsSync(localTsc) ? localTsc : null
}

function isPythonTestFile(filePath) {
  return /(?:^|\/)(?:test_.*\.py|.*_test\.py)$/i.test(filePath)
}

function isJsTsTestFile(filePath) {
  return /\.(?:test|spec)\.(?:js|jsx|ts|tsx|mjs|cjs)$/i.test(filePath)
}

/**
 * Runs real, isolated sandbox execution checks for syntax/build/typecheck/tests
 * strictly when supported by the isolated environment. Never fabricates 'passed'.
 *
 * @param {object} params
 * @param {string} params.workspaceDir
 * @param {Array<{path: string, content: string}>} params.allFiles
 * @param {string} params.targetLanguage
 * @param {string} params.expectedTestFramework
 * @param {boolean} [params.staticPassed=true]
 */
export async function runLanguageSandboxChecks({
  workspaceDir,
  allFiles = [],
  targetLanguage,
  expectedTestFramework,
  staticPassed = true,
}) {
  const dockerReady = await isDockerAvailable()
  const environment = dockerReady ? 'docker' : 'isolated-subprocess'

  const result = {
    executionEnvironment: environment,
    lint: { status: staticPassed ? 'passed' : 'failed', exitCode: null, output: '' },
    typecheck: { status: 'not_executed', exitCode: null, output: '' },
    build: { status: 'not_executed', exitCode: null, output: '' },
    tests: { status: 'not_executed', exitCode: null, output: '' },
  }

  if (!staticPassed) {
    result.build = { status: 'skipped', exitCode: null, output: 'Build execution skipped due to static syntax errors.' }
    result.tests = { status: 'skipped', exitCode: null, output: 'Test execution skipped due to static syntax errors.' }
    result.typecheck = { status: 'skipped', exitCode: null, output: 'Type-check execution skipped due to static syntax errors.' }
    return result
  }

  const filePaths = allFiles.map((f) => f.path.replace(/^\/+/, ''))

  // 1. PYTHON SANDBOX EXECUTION
  if (targetLanguage === 'python') {
    const pyFiles = filePaths.filter((p) => /\.py$/i.test(p))
    if (pyFiles.length === 0) {
      result.build = { status: 'skipped', exitCode: null, output: 'No Python files to compile.' }
      result.tests = { status: 'skipped', exitCode: null, output: 'No Python test files provided.' }
      return result
    }

    const pythonAvailable = dockerReady || (await hasBinary('python3'))
    if (!pythonAvailable) {
      result.build = { status: 'not_executed', exitCode: null, output: 'python3 runtime unavailable in sandbox.' }
      result.tests = { status: 'not_executed', exitCode: null, output: 'python3 runtime unavailable in sandbox.' }
      return result
    }

    // Real Python bytecode compilation check (build / syntax validation)
    const compileRun = await executeInSandbox({
      workspaceDir,
      command: 'python3',
      args: ['-m', 'py_compile', ...pyFiles],
      dockerImage: dockerReady ? 'python:3.11-slim' : null,
      timeoutMs: 6_000,
    })

    result.lint.exitCode = compileRun.exitCode
    result.build.exitCode = compileRun.exitCode

    if (compileRun.exitCode !== 0) {
      result.lint = {
        status: 'failed',
        exitCode: compileRun.exitCode,
        output: `python3 -m py_compile failed (exit ${compileRun.exitCode}):\n${compileRun.stderr || compileRun.stdout}`,
      }
      result.build = {
        status: 'failed',
        exitCode: compileRun.exitCode,
        output: `Python bytecode build failed:\n${compileRun.stderr || compileRun.stdout}`,
      }
      result.tests = { status: 'skipped', exitCode: null, output: 'Tests skipped because py_compile failed.' }
      return result
    }

    result.lint = {
      status: 'passed',
      exitCode: 0,
      output: `python3 -m py_compile succeeded across ${pyFiles.length} file(s) in ${compileRun.executionEnvironment} (${compileRun.durationMs}ms).`,
    }
    result.build = {
      status: 'passed',
      exitCode: 0,
      output: `Python bytecode compilation passed (exit 0, ${compileRun.durationMs}ms).`,
    }

    // Check Python unit tests in sandbox
    const pyTestFiles = pyFiles.filter(isPythonTestFile)
    if (pyTestFiles.length === 0) {
      result.tests = { status: 'skipped', exitCode: null, output: 'No Python test files present in refactor package.' }
      return result
    }

    if (expectedTestFramework === 'pytest') {
      const hasPytest = dockerReady ? false : await hasBinary('pytest')
      if (!hasPytest) {
        result.tests = {
          status: 'not_executed',
          exitCode: null,
          output: 'pytest runner is not installed in the isolated sandbox environment.',
        }
        return result
      }
      const pytestRun = await executeInSandbox({
        workspaceDir,
        command: 'pytest',
        args: ['-q', ...pyTestFiles],
        extraEnv: { PYTHONPATH: '.' },
        timeoutMs: 8_000,
      })
      const combined = `${pytestRun.stdout}\n${pytestRun.stderr}`.trim()
      if (pytestRun.exitCode === 0) {
        result.tests = { status: 'passed', exitCode: 0, output: `pytest passed:\n${combined}` }
      } else if (/ModuleNotFoundError:\s+No module named/i.test(combined)) {
        result.tests = {
          status: 'not_executed',
          exitCode: pytestRun.exitCode,
          output: `Tests could not complete because external repository dependencies are not installed in sandbox:\n${combined}`,
        }
      } else {
        result.tests = { status: 'failed', exitCode: pytestRun.exitCode, output: `pytest failed (exit ${pytestRun.exitCode}):\n${combined}` }
      }
      return result
    }

    // Standard library unittest execution
    const unittestModules = pyTestFiles.map((p) => p.replace(/\.py$/i, '').replace(/\//g, '.'))
    const unittestRun = await executeInSandbox({
      workspaceDir,
      command: 'python3',
      args: ['-m', 'unittest', '-v', ...unittestModules],
      dockerImage: dockerReady ? 'python:3.11-slim' : null,
      extraEnv: { PYTHONPATH: '.' },
      timeoutMs: 8_000,
    })

    const combined = `${unittestRun.stdout}\n${unittestRun.stderr}`.trim()
    if (unittestRun.exitCode === 0) {
      result.tests = {
        status: 'passed',
        exitCode: 0,
        output: `python3 -m unittest passed (exit 0, ${unittestRun.durationMs}ms):\n${combined}`,
      }
    } else if (/ModuleNotFoundError:\s+No module named/i.test(combined)) {
      result.tests = {
        status: 'not_executed',
        exitCode: unittestRun.exitCode,
        output: `Tests not executed: missing external repository dependencies in isolated sandbox.\n${combined}`,
      }
    } else {
      result.tests = {
        status: 'failed',
        exitCode: unittestRun.exitCode,
        output: `python3 -m unittest failed (exit ${unittestRun.exitCode}):\n${combined}`,
      }
    }
    return result
  }

  // 2. JAVASCRIPT / TYPESCRIPT SANDBOX EXECUTION
  if (targetLanguage === 'typescript' || targetLanguage === 'javascript') {
    const jsFiles = filePaths.filter((p) => /\.(?:js|mjs|cjs)$/i.test(p))
    const tsFiles = filePaths.filter((p) => /\.(?:ts|tsx)$/i.test(p))

    // Run real Node syntax check on JS files
    for (const jf of jsFiles) {
      const checkRun = await executeInSandbox({
        workspaceDir,
        command: 'node',
        args: ['--check', jf],
        dockerImage: dockerReady ? 'node:22-alpine' : null,
        timeoutMs: 4_000,
      })
      if (checkRun.exitCode !== 0) {
        result.lint = {
          status: 'failed',
          exitCode: checkRun.exitCode,
          output: `node --check failed on ${jf} (exit ${checkRun.exitCode}):\n${checkRun.stderr}`,
        }
        result.build = { status: 'skipped', exitCode: null, output: 'Skipped due to JS syntax failure.' }
        result.tests = { status: 'skipped', exitCode: null, output: 'Skipped due to JS syntax failure.' }
        return result
      }
    }

    // Check if files only have relative imports (no external npm packages like vitest/express)
    const hasExternalImports = allFiles.some((f) => {
      const imports = [...(f.content || '').matchAll(/(?:import\s+.*?\s+from\s+|require\s*\()\s*['"]([^'"]+)['"]/g)]
      return imports.some((m) => !m[1].startsWith('.') && !m[1].startsWith('node:'))
    })

    // Run real `tsc --noEmit` on self-contained TypeScript files when local tsc exists
    const tscBin = getLocalTscPath()
    if (tsFiles.length > 0 && tscBin && !hasExternalImports) {
      const tscRun = await executeInSandbox({
        workspaceDir,
        command: tscBin,
        args: ['--noEmit', '--strict', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--skipLibCheck', ...tsFiles],
        timeoutMs: 8_000,
      })
      const tscOut = `${tscRun.stdout}\n${tscRun.stderr}`.trim()
      result.typecheck = {
        status: tscRun.exitCode === 0 ? 'passed' : 'failed',
        exitCode: tscRun.exitCode,
        output: tscRun.exitCode === 0
          ? `tsc --noEmit passed across ${tsFiles.length} TypeScript file(s) (${tscRun.durationMs}ms).`
          : `tsc --noEmit failed (exit ${tscRun.exitCode}):\n${tscOut}`,
      }
      if (tscRun.exitCode === 0) {
        result.build = {
          status: 'passed',
          exitCode: 0,
          output: `Isolated TypeScript compiler check passed (exit 0, ${tscRun.durationMs}ms).`,
        }
      } else {
        result.build = {
          status: 'failed',
          exitCode: tscRun.exitCode,
          output: `TypeScript build/typecheck failed:\n${tscOut}`,
        }
        result.tests = { status: 'skipped', exitCode: null, output: 'Tests skipped because TypeScript compilation failed.' }
        return result
      }
    } else if (tsFiles.length > 0 && hasExternalImports) {
      result.typecheck = {
        status: 'not_executed',
        exitCode: null,
        output: 'Full tsc type-checking not executed: external npm dependencies are not installed in the isolated sandbox.',
      }
      result.build = {
        status: 'not_executed',
        exitCode: null,
        output: 'Full project build not executed: external dependencies / build script not mounted in isolated sandbox.',
      }
    }

    // Execute JS tests if they use Node's built-in test runner (`node:test`) cleanly without external deps
    const testFiles = filePaths.filter(isJsTsTestFile)
    if (testFiles.length === 0) {
      result.tests = { status: 'skipped', exitCode: null, output: 'No test files present in refactor package.' }
      return result
    }

    const usesNodeTestRunner = allFiles
      .filter((f) => isJsTsTestFile(f.path))
      .every((f) => /\bfrom\s+['"]node:test['"]|require\(['"]node:test['"]\)/.test(f.content || ''))

    if (usesNodeTestRunner && !hasExternalImports && jsFiles.some((p) => isJsTsTestFile(p))) {
      const nodeJsTests = jsFiles.filter(isJsTsTestFile)
      const testRun = await executeInSandbox({
        workspaceDir,
        command: 'node',
        args: ['--test', ...nodeJsTests],
        dockerImage: dockerReady ? 'node:22-alpine' : null,
        timeoutMs: 8_000,
      })
      const testOut = `${testRun.stdout}\n${testRun.stderr}`.trim()
      result.tests = {
        status: testRun.exitCode === 0 ? 'passed' : 'failed',
        exitCode: testRun.exitCode,
        output: testRun.exitCode === 0
          ? `node --test passed (exit 0, ${testRun.durationMs}ms):\n${testOut}`
          : `node --test failed (exit ${testRun.exitCode}):\n${testOut}`,
      }
      if (result.build.status === 'not_executed' && jsFiles.length > 0 && testRun.exitCode === 0) {
        result.build = { status: 'passed', exitCode: 0, output: `Node syntax & module load passed (${testRun.durationMs}ms).` }
      }
    } else {
      result.tests = {
        status: 'not_executed',
        exitCode: null,
        output: `Tests not executed in isolated sandbox (${expectedTestFramework} requires repository node_modules/build environment).`,
      }
    }

    return result
  }

  // 3. GO / JAVA / RUST (require host or Docker toolchain)
  result.build = {
    status: 'not_executed',
    exitCode: null,
    output: `${targetLanguage} compiler toolchain is not provisioned in this sandbox environment.`,
  }
  result.tests = {
    status: 'not_executed',
    exitCode: null,
    output: `${targetLanguage} test execution requires a ${targetLanguage} container runtime.`,
  }
  return result
}
