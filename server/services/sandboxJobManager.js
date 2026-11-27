import crypto from 'node:crypto'

export function getSandboxLimits() {
  const num = (envVal, fallback, min, max) => {
    const parsed = Number(envVal)
    if (!Number.isFinite(parsed) || parsed < min) return fallback
    return Math.min(parsed, max)
  }

  return {
    maxWorkspaceBytes: num(process.env.SANDBOX_MAX_WORKSPACE_BYTES, 10 * 1024 * 1024, 1024, 50 * 1024 * 1024),
    maxFiles: num(process.env.SANDBOX_MAX_FILES, 50, 1, 200),
    maxExecutionMs: num(process.env.SANDBOX_MAX_EXECUTION_MS, 8_000, 100, 60_000),
    maxMemoryMb: num(process.env.SANDBOX_MAX_MEMORY_MB, 256, 64, 2048),
    maxCpus: num(process.env.SANDBOX_MAX_CPUS, 0.5, 0.1, 4),
    maxPids: num(process.env.SANDBOX_MAX_PIDS, 64, 16, 256),
    maxOutputBytes: num(process.env.SANDBOX_MAX_OUTPUT_BYTES, 32_768, 512, 512 * 1024),
    maxConcurrentJobs: num(process.env.SANDBOX_MAX_CONCURRENT_JOBS, 4, 1, 32),
    maxUserJobs: num(process.env.SANDBOX_MAX_USER_JOBS, 2, 1, 16),
    queueWaitMs: num(process.env.SANDBOX_QUEUE_WAIT_MS, 5_000, 100, 30_000),
  }
}

export class SandboxJobError extends Error {
  constructor(message, code = 'SANDBOX_ERROR', status = 429) {
    super(message)
    this.name = 'SandboxJobError'
    this.code = code
    this.status = status
  }
}

/**
 * Manages concurrent sandbox jobs, per-user rate/queue limits, cancellation,
 * and guaranteed cleanup hooks across validation requests.
 */
export class SandboxJobManager {
  constructor() {
    this.activeCount = 0
    this.userJobCounts = new Map()
    this.waitQueue = []
    this.activeControllers = new Map()
  }

  getStats() {
    return {
      activeCount: this.activeCount,
      queuedCount: this.waitQueue.length,
      trackedUsers: this.userJobCounts.size,
    }
  }

  resetForTests() {
    for (const entry of this.waitQueue) {
      clearTimeout(entry.timer)
      entry.reject(new SandboxJobError('Sandbox queue reset', 'SANDBOX_CANCELLED', 503))
    }
    this.waitQueue = []
    this.activeCount = 0
    this.userJobCounts.clear()
    this.activeControllers.clear()
  }

  cancelJob(jobId) {
    const controller = this.activeControllers.get(jobId)
    if (controller) {
      controller.abort(new Error('Sandbox job cancelled'))
      return true
    }
    return false
  }

  async runJob({ userId = 'anonymous', limits: customLimits = null } = {}, taskFn) {
    const limits = { ...getSandboxLimits(), ...(customLimits || {}) }
    const userKey = String(userId || 'anonymous')
    const currentUserJobs = this.userJobCounts.get(userKey) || 0

    if (currentUserJobs >= limits.maxUserJobs) {
      throw new SandboxJobError(
        `Per-user sandbox concurrency limit reached (${limits.maxUserJobs} active/queued jobs). Please wait for current validations to finish.`,
        'SANDBOX_USER_LIMIT_EXCEEDED',
        429
      )
    }

    this.userJobCounts.set(userKey, currentUserJobs + 1)
    const jobId = `sbx_${crypto.randomUUID().slice(0, 12)}`
    const abortController = new AbortController()
    let acquired = false

    const releaseUserSlot = () => {
      const count = this.userJobCounts.get(userKey) || 0
      if (count <= 1) this.userJobCounts.delete(userKey)
      else this.userJobCounts.set(userKey, count - 1)
    }

    try {
      if (this.activeCount >= limits.maxConcurrentJobs) {
        if (this.waitQueue.length >= limits.maxConcurrentJobs * 4) {
          throw new SandboxJobError(
            'Sandbox execution queue is full. Try again shortly.',
            'SANDBOX_QUEUE_FULL',
            503
          )
        }

        await new Promise((resolve, reject) => {
          const entry = {
            resolve,
            reject,
            timer: null,
          }
          entry.timer = setTimeout(() => {
            const idx = this.waitQueue.indexOf(entry)
            if (idx !== -1) this.waitQueue.splice(idx, 1)
            reject(
              new SandboxJobError(
                'Timed out waiting for an available sandbox execution slot.',
                'SANDBOX_QUEUE_TIMEOUT',
                503
              )
            )
          }, limits.queueWaitMs)
          if (entry.timer.unref) entry.timer.unref()
          this.waitQueue.push(entry)
        })
      }

      this.activeCount += 1
      acquired = true
      this.activeControllers.set(jobId, abortController)

      return await taskFn({
        jobId,
        limits,
        signal: abortController.signal,
      })
    } finally {
      this.activeControllers.delete(jobId)
      if (acquired) {
        this.activeCount = Math.max(0, this.activeCount - 1)
        const nextWaiter = this.waitQueue.shift()
        if (nextWaiter) {
          clearTimeout(nextWaiter.timer)
          nextWaiter.resolve()
        }
      }
      releaseUserSlot()
    }
  }
}

export const sandboxJobManager = new SandboxJobManager()
