import type { Analysis, QaAnswer } from '../types'

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * Runs a fetch request with a browser-side timeout and user-friendly errors.
 */
async function request<T>(path: string, init: RequestInit, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal })
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
 * Calls the analysis API for a public GitHub repository.
 */
export function analyzeRepository(repositoryUrl: string) {
  return request<Analysis>('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryUrl }),
  })
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
