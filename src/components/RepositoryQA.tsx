import { FormEvent, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Send, HelpCircle, CheckCircle2, AlertCircle } from 'lucide-react'
import type { QaAnswer } from '../types'
import { askQuestion } from '../services/apiService'

/**
 * Terminal-style Q&A component grounded in a completed repository analysis.
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

  return (
    <form className="qa" onSubmit={submit}>
      <div className="qa-row">
        <input
          className="qa-input"
          style={{ borderRadius: '4px' }}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="QUERY: What should we refactor first?"
        />
        <button className="qa-button" disabled={loading} style={{ borderRadius: '4px' }}>
          {loading ? (
            <><span className="spinner" aria-hidden="true" /> EXECUTING</>
          ) : (
            <><Send size={12} /> ASK</>
          )}
        </button>
      </div>

      {loading && (
        <motion.div 
          className="scan" 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          style={{ marginTop: 10 }}
        >
          <span>QUERYING_TELEMETRY_ENGINE...</span>
        </motion.div>
      )}

      {error && (
        <motion.p 
          className="qa-error" 
          initial={{ opacity: 0, x: -5 }} 
          animate={{ opacity: 1, x: 0 }}
          style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '10px' }}
        >
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          {error}
        </motion.p>
      )}

      <AnimatePresence>
        {answer ? (
          <motion.div 
            className="qa-answer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              background: 'rgba(5, 12, 22, 0.9)',
              border: '1px solid rgba(125, 243, 195, 0.3)',
              borderRadius: '4px',
              padding: '14px',
              marginTop: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'var(--neon)', font: '500 11px "DM Mono", monospace' }}>
              <Terminal size={12} />
              <span>SYS.RESPONSE</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#e8f1fb' }}>{answer.answer}</p>
            <div className="qa-meta" style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed var(--line)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', fontFamily: '"DM Mono", monospace' }}>
              <span>CONFIDENCE: {Math.round(answer.confidence * 100)}%</span>
              {answer.sourceFiles.length > 0 && <span>SOURCES: {answer.sourceFiles.join(', ')}</span>}
            </div>
          </motion.div>
        ) : (
          !loading && (
            <p className="qa-hint" style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--muted)', fontFamily: '"DM Mono", monospace' }}>
              <HelpCircle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Ready for grounded repository inquiries.
            </p>
          )
        )}
      </AnimatePresence>
    </form>
  )
}
