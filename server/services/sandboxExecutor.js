import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { assertSafeExternalUrl } from './urlSecurity.js'
import { getSandboxLimits } from './sandboxJobManager.js'

const execFileAsync = promisify(execFile)

const ALLOWED_DOCKER_IMAGES = new Set(['python:3.11-slim', 'node:22-alpine'])
const ALLOWED_SANDBOX_COMMANDS = new Set(['python3', 'pytest', 'node', 'tsc'])
const BLOCKED_ENV_KEY_PATTERN = /(?:KEY|SECRET|TOKEN|PASS|PWD|AUTH|CREDENTIAL|COOKIE|PRIVATE|DATABASE|FIREBASE|GITHUB|OPENAI|GEMINI|AWS_|GCP_)/i
const ALLOWED_EXTRA_ENV_KEYS = new Set(['PYTHONPATH', 'PYTHONDONTWRITEBYTECODE', 'PYTHONNOUSERSITE', 'LANG', 'LC_ALL', 'TZ'])

let cachedDockerCheck = null
let customDockerProbe = null

export function setDockerProbeForTests(probeFn) {
  customDockerProbe = typeof probeFn === 'function' ? probeFn : null
  cachedDockerCheck = null
}

/**
 * Checks whether the current runtime is a production server (excluding Vitest unit runs).
 */
export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' && !process.env.VITEST
}

/**
 * Checks whether a Docker daemon is reachable on the host.
 * Result is cached for 60 seconds to avoid repeated daemon probes.
 * Never falls back or returns true if disabled or in subprocess-only mode.
 * @returns {Promise<boolean>}
 */
export async function isDockerAvailable(probeOverride = null) {
  const mode = (process.env.SANDBOX_MODE || 'auto').toLowerCase()
  if (mode === 'subprocess' || mode === 'disabled' || mode === 'remote') return false

  if (typeof probeOverride === 'function') {
    try {
      return Boolean(await probeOverride())
    } catch {
      return false
    }
  }

  if (customDockerProbe) {
    try {
      return Boolean(await customDockerProbe())
    } catch {
      return false
    }
  }

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
  customDockerProbe = null
}

/**
 * Resolves the active isolated execution provider strictly and fails closed in production.
 * Production workloads MUST NEVER downgrade silently from Docker/remote isolation to host subprocess execution.
 *
 * @param {object} [options]
 * @returns {Promise<{
 *   available: boolean,
 *   provider: 'docker' | 'remote-worker' | 'trusted-dev-subprocess' | 'sandbox_unavailable',
 *   workerUrl?: string,
 *   reason: string,
 * }>}
 */
export async function resolveExecutionProvider(options = {}) {
  const mode = (options.mode || process.env.SANDBOX_MODE || 'auto').toLowerCase()
  const isProd = typeof options.isProduction === 'boolean' ? options.isProduction : isProductionRuntime()
  const workerUrl = (options.workerUrl ?? process.env.SANDBOX_WORKER_URL ?? '').trim()

  if (mode === 'disabled') {
    return {
      available: false,
      provider: 'sandbox_unavailable',
      reason: 'Sandbox execution is disabled (SANDBOX_MODE=disabled).',
    }
  }

  if (mode === 'subprocess') {
    if (isProd) {
      return {
        available: false,
        provider: 'sandbox_unavailable',
        reason: 'Untrusted repository execution via host subprocess is prohibited in production (NODE_ENV=production). Configure Docker isolation or SANDBOX_WORKER_URL.',
      }
    }
    return {
      available: true,
      provider: 'trusted-dev-subprocess',
      reason: 'Trusted development/test subprocess mode.',
    }
  }

  if (mode === 'remote' || (mode === 'auto' && workerUrl)) {
    if (!workerUrl) {
      return {
        available: false,
        provider: 'sandbox_unavailable',
        reason: 'Remote sandbox mode requested (SANDBOX_MODE=remote) but SANDBOX_WORKER_URL is not configured.',
      }
    }
    try {
      const parsed = assertSafeExternalUrl(workerUrl, { allowHttp: !isProd })
      return {
        available: true,
        provider: 'remote-worker',
        workerUrl: parsed.toString().replace(/\/$/, ''),
        reason: 'External isolated sandbox worker.',
      }
    } catch (err) {
      return {
        available: false,
        provider: 'sandbox_unavailable',
        reason: `Remote sandbox worker URL rejected by security policy: ${err.message}`,
      }
    }
  }

  if (mode === 'docker' || mode === 'auto') {
    const dockerReady = await isDockerAvailable(options.dockerProbe)
    if (dockerReady) {
      return {
        available: true,
        provider: 'docker',
        reason: 'Hardened Docker container sandbox (non-root, --network=none, read-only rootfs).',
      }
    }

    if (mode === 'docker') {
      return {
        available: false,
        provider: 'sandbox_unavailable',
        reason: 'Docker container isolation is required (SANDBOX_MODE=docker), but the Docker daemon is unavailable. Failing closed without subprocess downgrade.',
      }
    }

    if (isProd) {
      return {
        available: false,
        provider: 'sandbox_unavailable',
        reason: 'No approved isolated execution provider (Docker daemon or HTTPS SANDBOX_WORKER_URL) is available in production. Failing closed.',
      }
    }

    return {
      available: true,
      provider: 'trusted-dev-subprocess',
      reason: 'Trusted local development/test environment (Docker daemon not detected).',
    }
  }

  return {
    available: false,
    provider: 'sandbox_unavailable',
    reason: `Unrecognized SANDBOX_MODE '${mode}'. Failing closed.`,
  }
}

/**
 * Validates that a command belongs strictly to the fixed allowlisted binaries
 * and never contains shell metacharacters or path traversal.
 * @param {string} command
 * @param {string[]} [args]
 */
export function assertAllowlistedCommand(command, args = []) {
  if (!command || typeof command !== 'string' || command.includes('\0') || /\s|[;&|`$<>]/.test(command)) {
    throw new Error(`Rejected unsafe sandbox command '${String(command)}'.`)
  }
  const baseName = path.basename(command)
  if (!ALLOWED_SANDBOX_COMMANDS.has(baseName)) {
    throw new Error(`Sandbox command '${baseName}' is not in the fixed validation allowlist.`)
  }
  if (baseName === 'tsc' && command !== 'tsc') {
    const expectedTsc = getLocalTscPath()
    if (!expectedTsc || path.resolve(command) !== path.resolve(expectedTsc)) {
      throw new Error('Rejected non-project tsc binary path.')
    }
  } else if (command !== baseName) {
    throw new Error(`Sandbox command must reference allowlisted binary name directly, received '${command}'.`)
  }

  if (!Array.isArray(args)) {
    throw new Error('Sandbox command arguments must be an array.')
  }
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) {
      throw new Error('Invalid sandbox command argument.')
    }
  }
}

/**
 * Validates that a Docker image belongs to the explicit allowlist.
 */
export function assertAllowedDockerImage(image) {
  if (!image || typeof image !== 'string') {
    throw new Error('Missing Docker sandbox image.')
  }
  const extraImages = (process.env.SANDBOX_ALLOWED_IMAGES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allowed = new Set([...ALLOWED_DOCKER_IMAGES, ...extraImages])
  if (!allowed.has(image) || !/^[a-z0-9./_-]+:[a-z0-9._-]+$/i.test(image)) {
    throw new Error(`Docker image '${image}' is not in the approved sandbox image allowlist.`)
  }
  return image
}

/**
 * Sanitizes extra environment variables passed to a sandbox command, blocking all secret keys.
 */
export function filterExtraSandboxEnv(extraEnv = {}) {
  const safe = {}
  for (const [k, v] of Object.entries(extraEnv || {})) {
    if (!/^[A-Z0-9_]+$/i.test(k)) continue
    if (BLOCKED_ENV_KEY_PATTERN.test(k)) continue
    if (!ALLOWED_EXTRA_ENV_KEYS.has(k)) continue
    safe[k] = String(v)
  }
  return safe
}

/**
 * Builds hardened Docker `run` argument vector and validates every security flag.
 */
export function buildHardenedDockerArgs({
  resolvedWorkspace,
  dockerImage,
  command,
  args = [],
  extraEnv = {},
  limits = getSandboxLimits(),
}) {
  assertAllowedDockerImage(dockerImage)
  assertAllowlistedCommand(command, args)

  const envArgs = []
  for (const [k, v] of Object.entries(filterExtraSandboxEnv(extraEnv))) {
    envArgs.push('-e', `${k}=${v}`)
  }

  const dockerArgs = [
    'run',
    '--rm',
    '--init',
    '--user', '65534:65534',
    '--network=none',
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    `--cpus=${limits.maxCpus}`,
    `--memory=${limits.maxMemoryMb}m`,
    `--memory-swap=${limits.maxMemoryMb}m`,
    `--pids-limit=${limits.maxPids}`,
    '--ulimit', 'nofile=64:64',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--mount', `type=bind,source=${resolvedWorkspace},target=/workspace`,
    '-w', '/workspace',
    ...envArgs,
    dockerImage,
    command,
    ...args,
  ]

  validateDockerArgs(dockerArgs, resolvedWorkspace)
  return dockerArgs
}

/**
 * Validates Docker run arguments so unsafe flags, host mounts, or Docker socket exposure can never occur.
 */
export function validateDockerArgs(dockerArgs = [], resolvedWorkspace = '') {
  const joined = dockerArgs.join(' ')
  if (dockerArgs.includes('--privileged') || joined.includes('--cap-add')) {
    throw new Error('Insecure Docker privilege escalation flag detected.')
  }
  if (joined.includes('docker.sock')) {
    throw new Error('Docker socket mount inside sandbox container is strictly forbidden.')
  }
  if (!dockerArgs.includes('--network=none')) {
    throw new Error('Docker sandbox requires --network=none.')
  }
  if (!dockerArgs.includes('--read-only')) {
    throw new Error('Docker sandbox requires --read-only root filesystem.')
  }
  if (!dockerArgs.includes('--cap-drop=ALL')) {
    throw new Error('Docker sandbox requires --cap-drop=ALL.')
  }
  if (!dockerArgs.some((a) => a.startsWith('--security-opt=no-new-privileges'))) {
    throw new Error('Docker sandbox requires --security-opt=no-new-privileges.')
  }
  const userIdx = dockerArgs.indexOf('--user')
  if (userIdx === -1 || dockerArgs[userIdx + 1] === '0:0' || dockerArgs[userIdx + 1] === 'root') {
    throw new Error('Docker sandbox must run as a non-root user.')
  }

  // Ensure no bind mount points outside the isolated workspace
  for (let i = 0; i < dockerArgs.length; i++) {
    const arg = dockerArgs[i]
    if (arg === '-v' || arg === '--volume') {
      const spec = dockerArgs[i + 1] || ''
      if (!spec.startsWith(`${resolvedWorkspace}:/workspace`)) {
        throw new Error(`Blocked unauthorized Docker volume mount: ${spec}`)
      }
    }
    if (arg === '--mount') {
      const spec = dockerArgs[i + 1] || ''
      if (!spec.startsWith(`type=bind,source=${resolvedWorkspace},target=/workspace`)) {
        throw new Error(`Blocked unauthorized Docker mount: ${spec}`)
      }
    }
  }
}

/**
 * Builds a minimal, secret-free environment for trusted dev/test subprocess execution.
 * Explicitly omits all application secrets (API keys, OAuth secrets, Firebase keys, tokens).
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
    NODE_OPTIONS: `--max-old-space-size=${getSandboxLimits().maxMemoryMb}`,
    CODEGENOME_SANDBOX: '1',
    HTTP_PROXY: 'http://127.0.0.1:0',
    HTTPS_PROXY: 'http://127.0.0.1:0',
    ALL_PROXY: 'http://127.0.0.1:0',
    NO_PROXY: '',
  }
}

/**
 * Computes total byte size of all regular files inside a workspace directory (skipping symlinks).
 */
export function measureWorkspaceBytes(dirPath) {
  let total = 0
  if (!fs.existsSync(dirPath)) return 0

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += measureWorkspaceBytes(full)
    } else if (entry.isFile()) {
      total += fs.lstatSync(full).size
    }
  }
  return total
}

/**
 * Verifies that every segment of a relative path inside the workspace is symlink-free
 * and that the realpath target stays strictly inside the workspace root.
 */
function assertSafeWorkspaceTarget(workspaceDir, rawPath) {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.includes('\0')) {
    throw new Error(`Invalid sandbox file path: ${String(rawPath)}`)
  }
  if (/^[a-zA-Z]:/.test(rawPath) || rawPath.includes('\\')) {
    throw new Error(`Path traversal detected in refactor file: ${rawPath}`)
  }

  const normalized = rawPath.replace(/^\/+/, '')
  const segments = normalized.split('/').filter((s) => s.length > 0)
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    throw new Error(`Path traversal detected in refactor file: ${rawPath}`)
  }

  const realRoot = fs.realpathSync(workspaceDir)
  let current = realRoot
  for (let i = 0; i < segments.length - 1; i++) {
    current = path.join(current, segments[i])
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Symbolic link escape detected in sandbox directory: ${rawPath}`)
      }
      const realCurrent = fs.realpathSync(current)
      if (!realCurrent.startsWith(realRoot + path.sep)) {
        throw new Error(`Workspace escape via symlink detected: ${rawPath}`)
      }
    }
  }

  const fullPath = path.resolve(realRoot, ...segments)
  if (fullPath !== realRoot && !fullPath.startsWith(realRoot + path.sep)) {
    throw new Error(`Path traversal detected in refactor file: ${rawPath}`)
  }

  if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isSymbolicLink()) {
    throw new Error(`Symbolic link target is forbidden inside sandbox: ${rawPath}`)
  }

  return fullPath
}

/**
 * Writes files into the isolated sandbox workspace with strict symlink, traversal,
 * file-count, and disk-size enforcement.
 */
export function writeSandboxFiles(workspaceDir, files = [], limits = getSandboxLimits()) {
  if (!Array.isArray(files)) {
    throw new Error('Sandbox files must be an array.')
  }
  if (files.length > limits.maxFiles) {
    throw new Error(`Sandbox file count limit exceeded (${files.length} > ${limits.maxFiles} files).`)
  }

  const realRoot = fs.realpathSync(workspaceDir)
  let totalBytes = 0

  for (const f of files) {
    if (!f || typeof f.path !== 'string') continue
    if (f.isSymlink || f.type === 'symlink' || f.mode === '120000') {
      throw new Error(`Symbolic link file entries are forbidden in sandbox: ${f.path}`)
    }

    const fullPath = assertSafeWorkspaceTarget(realRoot, f.path)
    const content = f.content !== undefined ? String(f.content) : (f.newContent !== undefined ? String(f.newContent) : '')
    totalBytes += Buffer.byteLength(content, 'utf8')
    if (totalBytes > limits.maxWorkspaceBytes) {
      throw new Error(`Sandbox disk limit exceeded (${limits.maxWorkspaceBytes} bytes).`)
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    // Re-verify parent realpath after mkdirSync in case of races
    const parentReal = fs.realpathSync(path.dirname(fullPath))
    if (parentReal !== realRoot && !parentReal.startsWith(realRoot + path.sep)) {
      throw new Error(`Workspace escape detected while writing ${f.path}`)
    }
    fs.writeFileSync(fullPath, content, { encoding: 'utf8', flag: 'w' })
  }

  return totalBytes
}

/**
 * Creates a temporary isolated sandbox directory with owner-only permissions.
 */
export function createSandboxWorkspace(prefix = 'codegenome-sandbox-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    fs.chmodSync(dir, 0o700)
  } catch {
    // Ignore on platforms not supporting POSIX chmod
  }
  return dir
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
 * Sends a single validation command to an external isolated HTTPS Sandbox Worker.
 */
async function executeOnRemoteWorker({
  workerUrl,
  workspaceDir,
  command,
  args,
  dockerImage,
  timeoutMs,
  maxOutputBytes,
  limits,
  signal,
  fetchImpl = fetch,
}) {
  const startedAt = Date.now()
  assertSafeExternalUrl(workerUrl, { allowHttp: !isProductionRuntime() })
  assertAllowlistedCommand(command, args)

  // Collect workspace regular files cleanly for remote worker transport
  const files = []
  const collect = (dir, relBase = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name
      if (entry.isDirectory()) collect(full, rel)
      else if (entry.isFile()) files.push({ path: rel, content: fs.readFileSync(full, 'utf8') })
    }
  }
  collect(workspaceDir)

  const workerToken = (process.env.SANDBOX_WORKER_TOKEN || '').trim()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Remote sandbox timed out after ${timeoutMs}ms.`)), timeoutMs + 1500)
  if (timer.unref) timer.unref()

  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }

  try {
    const res = await fetchImpl(`${workerUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
      },
      body: JSON.stringify({
        command,
        args,
        dockerImage,
        files,
        timeoutMs,
        maxOutputBytes,
        limits: {
          maxMemoryMb: limits.maxMemoryMb,
          maxCpus: limits.maxCpus,
          maxPids: limits.maxPids,
        },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Remote sandbox worker returned HTTP ${res.status}`)
    }
    const data = await res.json()
    return {
      exitCode: typeof data.exitCode === 'number' ? data.exitCode : 1,
      stdout: String(data.stdout || '').slice(0, maxOutputBytes),
      stderr: String(data.stderr || '').slice(0, maxOutputBytes),
      timedOut: Boolean(data.timedOut),
      durationMs: Number(data.durationMs || Date.now() - startedAt),
      executionEnvironment: 'remote-worker',
    }
  } catch (err) {
    const isAbort = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('timed out')
    return {
      exitCode: isAbort ? 124 : 125,
      stdout: '',
      stderr: String(err?.message || 'Remote sandbox worker execution error').slice(0, maxOutputBytes),
      timedOut: isAbort,
      durationMs: Date.now() - startedAt,
      executionEnvironment: isAbort ? 'remote-worker' : 'sandbox_unavailable',
      unavailable: !isAbort,
      error: err?.message,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Executes a single allowlisted command inside an isolated execution provider
 * (hardened Docker container, remote HTTPS worker, or trusted dev/test subprocess).
 * Never executes arbitrary shell commands and fails closed in production if no isolated provider exists.
 */
export async function executeInSandbox({
  workspaceDir,
  command,
  args = [],
  dockerImage = null,
  timeoutMs = getSandboxLimits().maxExecutionMs,
  maxOutputBytes = getSandboxLimits().maxOutputBytes,
  extraEnv = {},
  providerOverride = null,
  spawnImpl = spawn,
  fetchImpl = fetch,
  signal = null,
}) {
  const startedAt = Date.now()
  const limits = getSandboxLimits()
  const resolvedWorkspace = fs.realpathSync(workspaceDir)
  const workspaceBytes = measureWorkspaceBytes(resolvedWorkspace)

  if (workspaceBytes > limits.maxWorkspaceBytes) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Sandbox disk limit exceeded (${workspaceBytes} bytes > ${limits.maxWorkspaceBytes} bytes).`,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      executionEnvironment: 'sandbox_unavailable',
      error: 'Workspace disk limit exceeded',
    }
  }

  assertAllowlistedCommand(command, args)

  const provider = providerOverride || (await resolveExecutionProvider())
  if (!provider.available) {
    return {
      exitCode: null,
      stdout: '',
      stderr: provider.reason,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      executionEnvironment: 'sandbox_unavailable',
      unavailable: true,
      unavailableReason: provider.reason,
    }
  }

  if (provider.provider === 'remote-worker') {
    return executeOnRemoteWorker({
      workerUrl: provider.workerUrl,
      workspaceDir: resolvedWorkspace,
      command,
      args,
      dockerImage: dockerImage || 'node:22-alpine',
      timeoutMs,
      maxOutputBytes,
      limits,
      signal,
      fetchImpl,
    })
  }

  const executionEnvironment = provider.provider
  let spawnCmd = command
  let spawnArgs = args
  let spawnEnv = { ...buildSanitizedSandboxEnv(resolvedWorkspace), ...filterExtraSandboxEnv(extraEnv) }

  if (provider.provider === 'docker') {
    const selectedImage = dockerImage || (path.basename(command) === 'python3' || path.basename(command) === 'pytest' ? 'python:3.11-slim' : 'node:22-alpine')
    spawnCmd = 'docker'
    spawnArgs = buildHardenedDockerArgs({
      resolvedWorkspace,
      dockerImage: selectedImage,
      command,
      args,
      extraEnv,
      limits,
    })
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
      child = spawnImpl(spawnCmd, spawnArgs, {
        cwd: resolvedWorkspace,
        shell: false,
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      return resolve({
        exitCode: 127,
        stdout: '',
        stderr: err.message.slice(0, maxOutputBytes),
        timedOut: false,
        durationMs: Date.now() - startedAt,
        executionEnvironment,
        error: err.message,
      })
    }

    const terminateChild = () => {
      try {
        child.kill('SIGTERM')
      } catch {}
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
      }, 300)
      if (killTimer.unref) killTimer.unref()
    }

    const onAbort = () => {
      timedOut = true
      terminateChild()
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      terminateChild()
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
      signal?.removeEventListener('abort', onAbort)
      resolve({
        exitCode: 127,
        stdout,
        stderr: (stderr || err.message).slice(0, maxOutputBytes),
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
      signal?.removeEventListener('abort', onAbort)
      const timeoutNote = timedOut ? `${stderr}\nExecution timed out after ${timeoutMs}ms.`.trim() : stderr
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout: stdout.slice(0, maxOutputBytes),
        stderr: timeoutNote.slice(0, maxOutputBytes),
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
 * strictly when an approved isolated execution provider is available.
 * Never fabricates 'passed' and fails closed with 'sandbox_unavailable' in production
 * when Docker / remote worker isolation is unavailable.
 */
export async function runLanguageSandboxChecks({
  workspaceDir,
  allFiles = [],
  targetLanguage,
  expectedTestFramework,
  staticPassed = true,
  providerOverride = null,
  signal = null,
}) {
  const provider = providerOverride || (await resolveExecutionProvider())
  const limits = getSandboxLimits()

  if (!provider.available) {
    return {
      sandboxAvailable: false,
      unavailableReason: provider.reason,
      executionEnvironment: 'sandbox_unavailable',
      lint: {
        status: staticPassed ? 'passed' : 'failed',
        exitCode: null,
        output: staticPassed ? 'Static syntax analysis passed; runtime lint not executed because sandbox is unavailable.' : 'Static syntax validation failed.',
      },
      typecheck: {
        status: 'sandbox_unavailable',
        exitCode: null,
        output: `Sandbox unavailable: ${provider.reason}`,
      },
      build: {
        status: staticPassed ? 'sandbox_unavailable' : 'skipped',
        exitCode: null,
        output: staticPassed ? `Sandbox unavailable: ${provider.reason}` : 'Skipped due to static syntax errors.',
      },
      tests: {
        status: staticPassed ? 'sandbox_unavailable' : 'skipped',
        exitCode: null,
        output: staticPassed ? `Sandbox unavailable: ${provider.reason}` : 'Skipped due to static syntax errors.',
      },
    }
  }

  const dockerReady = provider.provider === 'docker'
  const remoteReady = provider.provider === 'remote-worker'
  const environment = provider.provider

  const result = {
    sandboxAvailable: true,
    unavailableReason: null,
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

  const filePaths = allFiles
    .map((f) => f.path.replace(/^\/+/, ''))
    .filter((p) => p && !p.split('/').some((seg) => seg.startsWith('-')))

  // 1. PYTHON SANDBOX EXECUTION
  if (targetLanguage === 'python') {
    const pyFiles = filePaths.filter((p) => /\.py$/i.test(p))
    if (pyFiles.length === 0) {
      result.build = { status: 'skipped', exitCode: null, output: 'No Python files to compile.' }
      result.tests = { status: 'skipped', exitCode: null, output: 'No Python test files provided.' }
      return result
    }

    const pythonAvailable = dockerReady || remoteReady || (await hasBinary('python3'))
    if (!pythonAvailable) {
      result.build = { status: 'not_executed', exitCode: null, output: 'python3 runtime unavailable in sandbox.' }
      result.tests = { status: 'not_executed', exitCode: null, output: 'python3 runtime unavailable in sandbox.' }
      return result
    }

    const compileRun = await executeInSandbox({
      workspaceDir,
      command: 'python3',
      args: ['-m', 'py_compile', ...pyFiles],
      dockerImage: 'python:3.11-slim',
      timeoutMs: Math.min(6_000, limits.maxExecutionMs),
      providerOverride: provider,
      signal,
    })

    if (compileRun.unavailable) {
      result.sandboxAvailable = false
      result.executionEnvironment = 'sandbox_unavailable'
      result.unavailableReason = compileRun.unavailableReason || compileRun.stderr
      result.build = { status: 'sandbox_unavailable', exitCode: null, output: compileRun.stderr }
      result.tests = { status: 'sandbox_unavailable', exitCode: null, output: compileRun.stderr }
      return result
    }

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

    const pyTestFiles = pyFiles.filter(isPythonTestFile)
    if (pyTestFiles.length === 0) {
      result.tests = { status: 'skipped', exitCode: null, output: 'No Python test files present in refactor package.' }
      return result
    }

    if (expectedTestFramework === 'pytest') {
      const hasPytest = remoteReady ? true : dockerReady ? false : await hasBinary('pytest')
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
        dockerImage: 'python:3.11-slim',
        extraEnv: { PYTHONPATH: '.' },
        timeoutMs: limits.maxExecutionMs,
        providerOverride: provider,
        signal,
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

    const unittestModules = pyTestFiles.map((p) => p.replace(/\.py$/i, '').replace(/\//g, '.'))
    const unittestRun = await executeInSandbox({
      workspaceDir,
      command: 'python3',
      args: ['-m', 'unittest', '-v', ...unittestModules],
      dockerImage: 'python:3.11-slim',
      extraEnv: { PYTHONPATH: '.' },
      timeoutMs: limits.maxExecutionMs,
      providerOverride: provider,
      signal,
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

    for (const jf of jsFiles) {
      const checkRun = await executeInSandbox({
        workspaceDir,
        command: 'node',
        args: ['--check', '--', `./${jf}`],
        dockerImage: 'node:22-alpine',
        timeoutMs: Math.min(4_000, limits.maxExecutionMs),
        providerOverride: provider,
        signal,
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

    const hasExternalImports = allFiles.some((f) => {
      const imports = [...(f.content || '').matchAll(/(?:import\s+.*?\s+from\s+|require\s*\()\s*['"]([^'"]+)['"]/g)]
      return imports.some((m) => !m[1].startsWith('.') && !m[1].startsWith('node:'))
    })

    const tscBin = getLocalTscPath()
    if (tsFiles.length > 0 && tscBin && !hasExternalImports && provider.provider === 'trusted-dev-subprocess') {
      const tscRun = await executeInSandbox({
        workspaceDir,
        command: tscBin,
        args: ['--noEmit', '--strict', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--skipLibCheck', ...tsFiles],
        timeoutMs: limits.maxExecutionMs,
        providerOverride: provider,
        signal,
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
    } else if (tsFiles.length > 0) {
      result.typecheck = {
        status: 'not_executed',
        exitCode: null,
        output: hasExternalImports
          ? 'Full tsc type-checking not executed: external npm dependencies are not installed in the isolated sandbox.'
          : 'tsc binary is not mounted inside container image.',
      }
      result.build = {
        status: 'not_executed',
        exitCode: null,
        output: 'Full project build not executed: external dependencies / build script not mounted in isolated sandbox.',
      }
    }

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
        args: ['--test', '--', ...nodeJsTests.map((p) => `./${p}`)],
        dockerImage: 'node:22-alpine',
        timeoutMs: limits.maxExecutionMs,
        providerOverride: provider,
        signal,
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

  // 3. GO / JAVA / RUST (require container toolchain)
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
