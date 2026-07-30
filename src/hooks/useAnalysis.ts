import { useState } from 'react'
import type { Analysis } from '../types'
import { analyzeRepository } from '../services/apiService'

/**
 * Manages the repository analysis lifecycle for the dashboard.
 */
export function useAnalysis() {
  const [results, setResults] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run(githubUrl: string) {
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const analysis = await analyzeRepository(githubUrl)
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

  return { run, results, loading, error, isDemo: Boolean(results?.isDemo) }
}
