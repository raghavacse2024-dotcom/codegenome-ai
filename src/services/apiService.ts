import type { Analysis, GitHubUser, QaAnswer, UserRepo, AgentEvent } from '../types'
import { auth } from './firebase'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const SESSION_STORAGE_KEY = 'codegenome_github_session'
const PAT_STORAGE_KEY = 'codegenome_github_pat'

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

export function getGitHubPat(): string | null {
  try {
    return localStorage.getItem(PAT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setGitHubPat(pat: string | null) {
  try {
    if (pat) {
      localStorage.setItem(PAT_STORAGE_KEY, pat)
    } else {
      localStorage.removeItem(PAT_STORAGE_KEY)
    }
  } catch {}
}

/**
 * Helper to build verified authentication headers for API requests.
 * Uses Firebase ID tokens (cryptographically verified on backend) or CodeGenome session tokens.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const sessionToken = getSessionToken()
  const pat = getGitHubPat()
  let fbToken: string | null = null
  if (auth?.currentUser) {
    try {
      fbToken = await auth.currentUser.getIdToken()
    } catch {}
  }

  const headers: Record<string, string> = {}
  if (fbToken) {
    headers['Authorization'] = `Bearer ${fbToken}`
  } else if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`
  }

  if (pat) {
    headers['X-GitHub-Token'] = pat
  }

  return headers
}

/**
 * Runs a fetch request with a browser-side timeout, auth token header, and user-friendly errors.
 */
async function request<T>(path: string, init: RequestInit, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const authHeaders = await getAuthHeaders()

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
      throw new Error('Secure tunnel timeout after 60 seconds. Please check your connection.')
    }
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Secure tunnel connection failed. Unable to reach backend gateway via encrypted channel.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

/**
 * Explicit offline synthetic demo sample generator (only invoked when the user explicitly requests a demo sample).
 * Never used to silently mask backend errors.
 */
export function createClientFallbackAnalysis(repositoryUrl: string, reason = 'User-requested offline demo sample'): Analysis {
  let owner = 'owner'
  let repository = 'repository'
  try {
    const clean = repositoryUrl.replace(/\/$/, '')
    const parts = clean.split('/')
    if (parts.length >= 2) {
      repository = parts[parts.length - 1]
      owner = parts[parts.length - 2]
    }
  } catch {}

  return {
    analysisId: 'local-fallback-' + Math.random().toString(36).slice(2, 9),
    createdAt: new Date().toISOString(),
    repo: {
      owner,
      repository,
      url: repositoryUrl,
      description: 'Synthetic demo fallback sample (live GitHub source files were not fetched).',
      stars: 0,
      defaultBranch: 'main'
    },
    source: 'demo',
    isDemo: true,
    isFallback: true,
    fallbackReason: reason,
    mode: 'demo',
    metadata: {
      analyzedFileCount: 0,
      repositoryFileCount: 0,
      samplingUsed: false,
      completeness: 'unavailable',
      analysisCoverage: '0%',
      samplingNotice: `Synthetic demo fallback (${reason}). Live repository files were not fetched.`
    },
    events: [
      { agent: 'Ingestion', status: 'complete', rationale: `Loaded synthetic demo shell for ${owner}/${repository} (${reason}).`, at: new Date().toISOString() },
      { agent: 'Architecture', status: 'complete', rationale: 'Loaded illustrative architectural baseline.', at: new Date().toISOString() },
      { agent: 'Technical Debt', status: 'complete', rationale: 'Loaded illustrative complexity baseline.', at: new Date().toISOString() },
      { agent: 'Risk & Cost', status: 'complete', rationale: 'Loaded illustrative impact estimate.', at: new Date().toISOString() },
      { agent: 'Refactor Planner', status: 'complete', rationale: 'Generated illustrative refactoring scaffold.', at: new Date().toISOString() },
      { agent: 'Review', status: 'complete', rationale: 'Marked human review required (synthetic fallback).', at: new Date().toISOString() }
    ],
    results: {
      architecture: {
        data: {
          framework: 'Demo Sample',
          layers: ['Client UI', 'API Gateway', 'Multi-Agent Mesh'],
          violations: [],
          summary: 'Synthetic demo fallback: connect live backend & GitHub access for real repository analysis.',
          structure: {
            sampledFileCount: 0,
            rootDirectories: ['src'],
            languages: [['TypeScript', 1]],
            entryPoints: []
          }
        }
      },
      debt: {
        data: {
          hotspots: [],
          totalDebtScore: 0,
          summary: 'No real repository files indexed in synthetic demo fallback.'
        }
      },
      cost: {
        data: {
          annualCost: 0,
          priority: 'Low',
          roiMonths: 1,
          assumption: 'Synthetic offline demo estimate — no repository files executed or parsed.'
        }
      },
      refactor: {
        data: {
          target: 'src/sample.ts',
          steps: [
            'Retry analysis against the live backend once connectivity is restored.'
          ],
          scaffolds: [
            {
              path: 'src/sample.ts',
              content: `export function sampleReady() {\n  return { status: 'demo' };\n}\n`
            }
          ],
          refactoredTarget: '',
          pullRequestTitle: 'chore: synthetic demo sample (not verified against live repository)',
          state: 'HUMAN_REVIEW_REQUIRED',
          validation: {
            tests: 'not_executed',
            lint: 'not_executed',
            typecheck: 'not_executed',
            build: 'not_executed',
            policy: 'unknown',
            safeToPropose: false
          }
        }
      },
      review: {
        data: {
          verdict: 'Human Review Required',
          state: 'HUMAN_REVIEW_REQUIRED',
          checks: [
            'Synthetic demo fallback: real repository files were not analyzed.',
            'Tests executed: NOT_EXECUTED',
            'Build executed: NOT_EXECUTED'
          ],
          caveat: 'Synthetic fallback sample only. Retry against live backend for real validation.'
        }
      }
    }
  }
}

/**
 * Calls the analysis API for a public or private GitHub repository.
 * Propagates errors cleanly instead of silently replacing failures with fake data.
 */
export async function analyzeRepository(repositoryUrl: string): Promise<Analysis> {
  return await request<Analysis>('/api/analyze', {
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
 * Real-time Server-Sent Events (SSE) repository analysis using fetch streaming.
 * Sends credentials in Authorization header to prevent exposing tokens in URLs.
 * Surfaces real errors transparently to the UI for retry.
 */
export async function analyzeRepositoryStream(
  repositoryUrl: string,
  callbacks: StreamCallbacks = {}
): Promise<Analysis> {
  const authHeaders = await getAuthHeaders()

  const response = await fetch(`${API_URL}/api/analyze/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ repositoryUrl }),
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => null)
    const msg = errBody?.error || `Analysis stream failed with status ${response.status}.`
    const err = new Error(msg)
    callbacks.onError?.(err)
    throw err
  }

  if (!response.body) {
    return await analyzeRepository(repositoryUrl)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalAnalysis: Analysis | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''

    for (const part of parts) {
      if (!part.trim()) continue
      let eventType = 'message'
      let dataStr = ''

      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice(6)
        }
      }

      if (!dataStr) continue

      const parsed = JSON.parse(dataStr)
      if (eventType === 'status') {
        callbacks.onStatus?.(parsed)
      } else if (eventType === 'agent_event') {
        callbacks.onAgentEvent?.(parsed)
      } else if (eventType === 'complete') {
        finalAnalysis = parsed as Analysis
      } else if (eventType === 'error') {
        const streamErr = new Error(parsed.error || 'Repository analysis encountered a backend error.')
        callbacks.onError?.(streamErr)
        throw streamErr
      }
    }
  }

  if (finalAnalysis) return finalAnalysis
  throw new Error('Analysis stream ended unexpectedly before delivering final telemetry.')
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

export function registerSession(sessionId: string, user?: GitHubUser, token?: string) {
  return request<{ success: boolean }>('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, user, token }),
  }).catch(() => null)
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
    setGitHubPat(null)
    try {
      localStorage.removeItem('codegenome_github_user')
    } catch {}
  }
}

/**
 * Downloads the generated scaffold ZIP for a completed analysis.
 */
export async function downloadScaffolds(analysisId: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 60_000)
  const authHeaders = await getAuthHeaders()

  try {
    const response = await fetch(`${API_URL}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
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
export function askQuestion(
  analysisId: string,
  question: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  return request<QaAnswer>('/api/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysisId, question, history }),
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
 * Clears all persistent repository scan history for the authenticated user from Firestore.
 */
export function clearAnalysisHistory(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/history', {
    method: 'DELETE',
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
  confirmedHighRisk?: boolean
}): Promise<import('../types').PullRequestResult> {
  return request<import('../types').PullRequestResult>('/api/pr/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
}

/**
 * Downloads raw unified .patch file for the refactor package.
 */
export async function downloadGitPatch(analysisId: string) {
  const authHeaders = await getAuthHeaders()
  const response = await fetch(`${API_URL}/api/pr/patch/${analysisId}?download=true`, {
    headers: authHeaders,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Patch download failed' }))
    throw new Error(payload.error || 'Patch download failed')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'codegenome-refactor.patch'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}


