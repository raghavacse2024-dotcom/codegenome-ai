import { FormEvent, useState } from 'react'
import type { QaAnswer } from '../types'
import { askQuestion } from '../services/apiService'

/**
 * Lets users ask questions grounded in a completed repository analysis.
 */
export function RepositoryQA({ analysisId }: { analysisId: string }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<QaAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!question.trim()) return
    setLoading(true)
    setError('')
    try {
      setAnswer(await askQuestion(analysisId, question))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Q&A failed.')
    } finally {
      setLoading(false)
    }
  }

  return <form className="qa" onSubmit={submit}><div className="qa-row"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What should we refactor first?" /><button disabled={loading}>{loading ? 'Asking...' : 'Ask'}</button></div>{error && <p className="qa-error">{error}</p>}{answer ? <div className="qa-answer"><p>{answer.answer}</p><span>Confidence {Math.round(answer.confidence * 100)}%</span>{answer.sourceFiles.length > 0 && <small>Sources: {answer.sourceFiles.join(', ')}</small>}</div> : <p>Ask a focused question after analysis.</p>}</form>
}
