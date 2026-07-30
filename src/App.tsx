import { FormEvent, useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import type { Analysis, Scaffold } from './types'

const demoUrl = 'https://github.com/vercel/turbo'
const agents = ['Architecture', 'Technical Debt', 'Risk & Cost', 'Refactor Planner', 'Review']
const historyKey = 'codegenome-history'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }
function copy(value: string) { navigator.clipboard.writeText(value) }
async function downloadZip(scaffolds: Scaffold[]) {
  const zip = new JSZip(); scaffolds.forEach((file) => zip.file(file.path, file.content))
  const blob = await zip.generateAsync({ type: 'blob' }), link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = 'codegenome-refactor-scaffold.zip'; link.click(); URL.revokeObjectURL(link.href)
}

export default function App() {
  const [url, setUrl] = useState(demoUrl), [analysis, setAnalysis] = useState<Analysis | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [history, setHistory] = useState<string[]>([]), [question, setQuestion] = useState('')
  useEffect(() => { try { setHistory(JSON.parse(localStorage.getItem(historyKey) || '[]')) } catch { /* ignored */ } }, [])
  const currentEvents = useMemo(() => analysis?.events || [], [analysis])
  async function analyze(event?: FormEvent) {
    event?.preventDefault(); setLoading(true); setError(''); setAnalysis(null)
    try { const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repositoryUrl: url }) }); const text = await response.text(); let payload: { error?: string } & Analysis
      try { payload = text ? JSON.parse(text) : {} } catch { throw new Error('Analysis service returned an invalid response. Restart the development server and retry.') }
      if (!response.ok) throw new Error(payload.error || `Analysis failed with status ${response.status}.`)
      if (!text) throw new Error('Analysis service returned an empty response. Restart the development server and retry.')
      setAnalysis(payload); const next = [url, ...history.filter((item) => item !== url)].slice(0, 5); setHistory(next); localStorage.setItem(historyKey, JSON.stringify(next)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Analysis failed.') } finally { setLoading(false) }
  }
  const qaAnswer = analysis && question ? `Based on the sampled repository, ${analysis.results.review.data.verdict.toLowerCase()} recommendations prioritize ${analysis.results.refactor.data.target}. ${analysis.results.debt.data.summary}` : ''
  return <main><header><div><p className="eyebrow">MULTI-AGENT CODING INTELLIGENCE</p><h1>Code<span>Genome</span> AI</h1></div><p className="header-copy">Turn unfamiliar repositories into an evidence-backed refactoring plan.</p></header>
    <Card className="hero"><div><h2>Map debt. Price risk. Ship safer code.</h2><p>Five specialized agents trace the path from source tree to reviewed scaffold.</p></div><form onSubmit={analyze}><label htmlFor="repo">Public GitHub repository</label><div className="input-row"><input id="repo" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repository" /><button disabled={loading}>{loading ? 'Analyzing…' : 'Analyze repository'}</button></div><button type="button" className="link-button" onClick={() => setUrl(demoUrl)}>Use demo repository</button></form>{history.length > 0 && <div className="history">Recent: {history.map((item) => <button key={item} onClick={() => setUrl(item)}>{item.replace('https://github.com/', '')}</button>)}</div>}</Card>
    {(loading || analysis) && <section className="workflow"><div className="workflow-heading"><h2>Agentic workflow</h2><span>{loading ? 'Planning & reviewing' : 'Completed'}</span></div>{agents.map((agent, index) => { const log = currentEvents.find((entry) => entry.agent === agent && entry.status === 'complete'); return <div className={`agent ${log ? 'done' : loading ? 'active' : ''}`} key={agent}><b>0{index + 1}</b><div><strong>{agent} Agent</strong><p>{log?.rationale || (loading ? 'Preparing specialized context…' : 'Awaiting analysis')}</p></div><i>{log ? '✓' : '→'}</i></div> })}</section>}
    {error && <Card className="error"><strong>Analysis couldn’t start.</strong><p>{error}</p><p>Check that the URL is a public GitHub repository. Add a `GITHUB_TOKEN` on Render if GitHub rate limits are reached.</p></Card>}
    {analysis && <Results analysis={analysis} question={question} setQuestion={setQuestion} qaAnswer={qaAnswer} />}
  </main>
}

function Results({ analysis, question, setQuestion, qaAnswer }: { analysis: Analysis; question: string; setQuestion: (value: string) => void; qaAnswer: string }) {
  const { architecture, debt, cost, refactor, review } = analysis.results
  return <><div className="notice">{analysis.source === 'live' ? 'Live OpenAI-enhanced analysis' : 'Demo-safe deterministic analysis — add OPENAI_API_KEY and OPENAI_MODEL for live agent enhancement.'}</div><section className="metrics"><Card><span>Debt score</span><strong>{debt.data.totalDebtScore}<small>/100</small></strong></Card><Card><span>Estimated annual drag</span><strong>${cost.data.annualCost.toLocaleString()}</strong></Card><Card><span>Refactor payback</span><strong>{cost.data.roiMonths} mo.</strong></Card><Card><span>Review status</span><strong className="verified">{review.data.verdict} ✓</strong></Card></section>
    <section className="grid"><Card><p className="eyebrow">ARCHITECTURE MAP</p><h2>{architecture.data.framework}</h2><p>{architecture.data.summary}</p><div className="tags">{architecture.data.layers.map((layer) => <span key={layer}>{layer}</span>)}</div>{architecture.data.violations.length > 0 && <ul>{architecture.data.violations.map((violation) => <li key={violation}>{violation}</li>)}</ul>}</Card><Card><p className="eyebrow">REPOSITORY FOOTPRINT</p><h2>{architecture.data.structure.sampledFileCount} files sampled</h2><p>{architecture.data.structure.rootDirectories.join(' · ') || 'Flat source structure'}</p><div className="tags">{architecture.data.structure.languages.map(([language, count]) => <span key={language}>{language} {count}</span>)}</div></Card><Card><p className="eyebrow">RISK & COST</p><h2>{cost.data.priority} priority</h2><p>{cost.data.assumption}</p><div className="bar"><i style={{ width: `${Math.min(100, debt.data.totalDebtScore)}%` }} /></div></Card></section>
    <Card><div className="section-head"><div><p className="eyebrow">TECHNICAL DEBT</p><h2>Evidence, not guesswork</h2></div><span>{debt.data.summary}</span></div><div className="hotspots">{debt.data.hotspots.map((hotspot) => <article key={hotspot.path}><div><strong>{hotspot.path}</strong><p>{hotspot.signals.join(' · ') || 'complexity signal'}</p></div><b>{hotspot.score}</b><span>{hotspot.lines} lines</span></article>)}</div></Card>
    <Card><div className="section-head"><div><p className="eyebrow">REFACTOR PLAN</p><h2>{refactor.data.pullRequestTitle}</h2></div><button onClick={() => downloadZip(refactor.data.scaffolds)}>Download scaffolds</button></div><ol>{refactor.data.steps.map((step) => <li key={step}>{step}</li>)}</ol>{refactor.data.scaffolds.map((file) => <div className="code" key={file.path}><div><span>{file.path}</span><button onClick={() => copy(file.content)}>Copy</button></div><pre>{file.content}</pre></div>)}</Card>
    <section className="grid"><Card><p className="eyebrow">SELF-REVIEW</p><h2>{review.data.verdict} ✓</h2><ul>{review.data.checks.map((check) => <li key={check}>{check}</li>)}</ul>{review.data.caveat && <p className="caveat">{review.data.caveat}</p>}</Card><Card><p className="eyebrow">REPOSITORY Q&A</p><h2>Ask the completed analysis</h2><div className="qa"><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should we refactor first?" /><p>{qaAnswer || 'Ask a focused question after analysis.'}</p></div></Card></section>
  </>
}
