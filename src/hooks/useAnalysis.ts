import { useState, useEffect } from 'react'
import type { Analysis, AgentEvent } from '../types'
import { analyzeRepositoryStream } from '../services/apiService'
import { isPageReload } from '../utils/navigation'

/**
 * Manages the repository analysis lifecycle for the dashboard with real-time SSE streaming.
 */
export function useAnalysis() {
  const [results, setResults] = useState<Analysis | null>(() => {
    try {
      // Only retain active analysis when the user refreshes an existing open tab
      if (!isPageReload()) {
        sessionStorage.removeItem('codegenome_active_analysis')
        return null
      }
      const cached = sessionStorage.getItem('codegenome_active_analysis')
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streamEvents, setStreamEvents] = useState<AgentEvent[]>(() => {
    try {
      if (!isPageReload()) {
        return []
      }
      const cached = sessionStorage.getItem('codegenome_active_analysis')
      if (cached) {
        const parsed = JSON.parse(cached)
        return parsed.events || []
      }
    } catch {}
    return []
  })
  const [streamStatus, setStreamStatus] = useState<string>('')

  useEffect(() => {
    try {
      if (results) {
        sessionStorage.setItem('codegenome_active_analysis', JSON.stringify(results))
      }
    } catch {}
  }, [results])

  async function run(githubUrl: string) {
    setLoading(true)
    setError('')
    setResults(null)
    setStreamEvents([])
    try {
      sessionStorage.removeItem('codegenome_active_analysis')
    } catch {}
    setStreamStatus('Initializing SSE streaming pipeline...')
    try {
      const analysis = await analyzeRepositoryStream(githubUrl, {
        onStatus: (status) => {
          if (status.message) {
            setStreamStatus(status.message)
          }
        },
        onAgentEvent: (event) => {
          setStreamEvents((prev) => {
            // Replace or append event
            const filtered = prev.filter(
              (e) => !(e.agent === event.agent && e.status === event.status)
            )
            return [...filtered, event]
          })
          setStreamStatus(`${event.agent} agent: ${event.status.toUpperCase()}`)
        },
        onError: (streamErr) => {
          setError(streamErr.message)
        }
      })
      setResults(analysis)
      return analysis
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Analysis failed.'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  function setLoadedAnalysis(analysis: Analysis) {
    setResults(analysis)
    setStreamEvents(analysis.events || [])
    setError('')
    try {
      sessionStorage.setItem('codegenome_active_analysis', JSON.stringify(analysis))
    } catch {}
  }

  return { 
    run, 
    results, 
    loading, 
    error, 
    isDemo: Boolean(results?.isDemo), 
    setLoadedAnalysis,
    streamEvents,
    streamStatus
  }
}
