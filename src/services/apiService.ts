import type { Analysis, GitHubUser, QaAnswer, UserRepo, AgentEvent } from '../types'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const SESSION_STORAGE_KEY = 'codegenome_github_session'

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(SESSION_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {}
}

/**
 * Runs a fetch request with a browser-side timeout, auth token header, and user-friendly errors.
 */
async function request<T>(path: string, init: RequestInit, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const token = getSessionToken()
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init.headers || {}),
      },
      signal: controller.signal,
    })
    const text = await response.text()
    const payload = text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text
    if (!response.ok) throw new Error((payload as { error?: string })?.error || `Request failed with status ${response.status}.`)
    return payload as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Timeout after 60 seconds. Try a smaller repository or add GITHUB_TOKEN on Render.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

/**
 * Calls the analysis API for a public or private GitHub repository.
 */
export function analyzeRepository(repositoryUrl: string) {
  return request<Analysis>('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryUrl }),
  })
}

export interface StreamCallbacks {
  onStatus?: (status: { phase: string; message: string; timestamp?: string }) => void
  onAgentEvent?: (event: AgentEvent) => void
  onError?: (err: Error) => void
}

/**
 * Real-time Server-Sent Events (SSE) repository analysis.
 * Receives immediate live agent events as nodes progress and resolves with full Analysis.
 */
export function analyzeRepositoryStream(
  repositoryUrl: string,
  callbacks: StreamCallbacks = {}
): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    const token = getSessionToken()
    const queryParams = new URLSearchParams({ url: repositoryUrl })
    if (token) {
      queryParams.set('token', token)
    }

    const sseUrl = `${API_URL}/api/analyze/stream?${queryParams.toString()}`
    let eventSource: EventSource | null = null
    let hasResolved = false

    try {
      eventSource = new EventSource(sseUrl)

      eventSource.addEventListener('status', (e) => {
        try {
          const data = JSON.parse(e.data)
          callbacks.onStatus?.(data)
        } catch {}
      })

      eventSource.addEventListener('agent_event', (e) => {
        try {
          const agentEvent: AgentEvent = JSON.parse(e.data)
          callbacks.onAgentEvent?.(agentEvent)
        } catch {}
      })

      eventSource.addEventListener('complete', (e) => {
        try {
          hasResolved = true
          const analysis: Analysis = JSON.parse(e.data)
          eventSource?.close()
          resolve(analysis)
        } catch (err) {
          eventSource?.close()
          reject(err)
        }
      })

      eventSource.addEventListener('error', (e) => {
        // Check if server sent a formatted error event
        if (e instanceof MessageEvent && e.data) {
          try {
            const errData = JSON.parse(e.data)
            hasResolved = true
            eventSource?.close()
            const err = new Error(errData.error || 'SSE stream failed.')
            callbacks.onError?.(err)
            reject(err)
            return
          } catch {}
        }

        // If closed without complete payload, fallback or reject
        if (!hasResolved) {
          eventSource?.close()
          // If EventSource network failure, fallback gracefully to standard POST analyze
          console.warn('[SSE] EventSource closed before complete. Falling back to HTTP analyze...')
          analyzeRepository(repositoryUrl)
            .then((analysis) => {
              hasResolved = true
              resolve(analysis)
            })
            .catch((fallbackErr) => {
              hasResolved = true
              callbacks.onError?.(fallbackErr)
              reject(fallbackErr)
            })
        }
      })

      eventSource.addEventListener('done', () => {
        eventSource?.close()
      })
    } catch (initErr) {
      // Immediate fallback if EventSource cannot initialize
      console.warn('[SSE] EventSource initialization failed, using standard HTTP:', initErr)
      analyzeRepository(repositoryUrl)
        .then(resolve)
        .catch(reject)
    }
  })
}

/**
 * Fetches GitHub OAuth authorization URL
 */
export function getGitHubAuthUrl() {
  return request<{ configured: boolean; url: string | null; callbackUrl: string; message?: string }>('/api/auth/github/url', {
    method: 'GET',
  })
}

/**
 * Validates a Personal Access Token directly
 */
export function authenticateWithToken(token: string) {
  return request<{ sessionId: string; user: GitHubUser }>('/api/auth/github/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

/**
 * Fetches current authenticated user status
 */
export function getCurrentUser() {
  return request<{ authenticated: boolean; user: GitHubUser | null }>('/api/auth/user', {
    method: 'GET',
  })
}

/**
 * Fetches repositories accessible to the logged in user (including private)
 */
export function getUserRepositories() {
  return request<{ repositories: UserRepo[] }>('/api/auth/repos', {
    method: 'GET',
  })
}

/**
 * Logs out user session
 */
export async function logoutUser() {
  try {
    await request('/api/auth/logout', { method: 'POST' })
  } finally {
    setSessionToken(null)
  }
}

/**
 * Downloads the generated scaffold ZIP for a completed analysis.
 */
export async function downloadScaffolds(analysisId: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 60_000)
  try {
    const response = await fetch(`${API_URL}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Download failed.' }))
      throw new Error(payload.error || 'Download failed.')
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const disposition = response.headers.get('content-disposition') || ''
    link.href = url
    link.download = disposition.match(/filename="([^"]+)"/)?.[1] || 'codegenome-refactor.zip'
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Download timed out. Please run the analysis again.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

/**
 * Asks a grounded question against a completed analysis.
 */
export function askQuestion(analysisId: string, question: string) {
  return request<QaAnswer>('/api/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysisId, question }),
  })
}

/**
 * Retrieves past repository scan history stored in persistent database.
 */
export function getAnalysisHistory(): Promise<{ analyses: Analysis[] }> {
  return request<{ analyses: Analysis[] }>('/api/history', {
    method: 'GET',
  })
}

/**
 * Retrieves a single persistent analysis record by ID.
 */
export function getSavedAnalysis(analysisId: string): Promise<Analysis> {
  return request<Analysis>(`/api/analysis/${analysisId}`, {
    method: 'GET',
  })
}

/**
 * Creates an automated GitHub Pull Request or provides a verified preview PR.
 */
export function createAutomatedPullRequest(params: {
  analysisId: string
  title?: string
  branch?: string
  body?: string
  baseBranch?: string
}): Promise<import('../types').PullRequestResult> {
  const token = getSessionToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return request<import('../types').PullRequestResult>('/api/pr/create', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })
}

/**
 * Downloads raw unified .patch file for the refactor package.
 */
export function downloadGitPatch(analysisId: string) {
  const url = `${API_URL}/api/pr/patch/${analysisId}?download=true`
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'codegenome-refactor.patch'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}


