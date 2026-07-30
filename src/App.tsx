import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAnalysis } from './hooks/useAnalysis'
import { ResultsPanel } from './components/ResultsPanel'

const demoUrl = 'https://github.com/vercel/turbo'
const agents = ['Architecture', 'Technical Debt', 'Risk & Cost', 'Refactor Planner', 'Review']
const historyKey = 'codegenome-history'

/**
 * Reusable surface wrapper for dashboard sections.
 */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export default function App() {
  const [url, setUrl] = useState(demoUrl)
  const [history, setHistory] = useState<string[]>([])
  const { run, results: analysis, loading, error } = useAnalysis()
  const currentEvents = useMemo(() => analysis?.events || [], [analysis])

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(historyKey) || '[]'))
    } catch {
      setHistory([])
    }
  }, [])

  async function analyze(event?: FormEvent) {
    event?.preventDefault()
    try {
      await run(url)
      const next = [url, ...history.filter((item) => item !== url)].slice(0, 5)
      setHistory(next)
      localStorage.setItem(historyKey, JSON.stringify(next))
    } catch {
      // The hook owns the user-facing error message.
    }
  }

  return <main><header><div><p className="eyebrow">MULTI-AGENT CODING INTELLIGENCE</p><h1>Code<span>Genome</span> AI</h1></div><p className="header-copy">Turn unfamiliar repositories into an evidence-backed refactoring plan.</p></header>
    <Card className="hero"><div><h2>Map debt. Price risk. Ship safer code.</h2><p>Five specialized agents trace the path from source tree to reviewed scaffold.</p></div><form onSubmit={analyze}><label htmlFor="repo">Public GitHub repository</label><div className="input-row"><input id="repo" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repository" /><button disabled={loading}>{loading ? 'Analyzing...' : 'Analyze repository'}</button></div><button type="button" className="link-button" onClick={() => setUrl(demoUrl)}>Use demo repository</button></form>{history.length > 0 && <div className="history">Recent: {history.map((item) => <button key={item} onClick={() => setUrl(item)}>{item.replace('https://github.com/', '')}</button>)}</div>}</Card>
    {(loading || analysis) && <section className="workflow"><div className="workflow-heading"><h2>Agentic workflow</h2><span>{loading ? 'Planning and reviewing' : 'Completed'}</span></div>{agents.map((agent, index) => { const log = currentEvents.find((entry) => entry.agent === agent && entry.status === 'complete'); return <article className={`agent ${log ? 'done' : loading ? 'active' : ''}`} key={agent}><b>0{index + 1}</b><div><strong>{agent} Agent</strong><p>{log?.rationale || (loading ? 'Preparing specialized context...' : 'Awaiting analysis')}</p></div><i>{log ? 'Done' : 'Next'}</i></article> })}</section>}
    {error && <Card className="error"><strong>Analysis could not start.</strong><p>{error}</p><p>Check that the URL is a public GitHub repository. Add GITHUB_TOKEN on Render if GitHub rate limits are reached.</p></Card>}
    {analysis && <ResultsPanel analysis={analysis} />}
  </main>
}
