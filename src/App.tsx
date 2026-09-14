import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Cpu, CheckSquare, AlertTriangle, Play, LayoutDashboard, Lock, Unlock } from 'lucide-react'
import { useAnalysis } from './hooks/useAnalysis'
import { useScrollSpy } from './hooks/useScrollSpy'
import { ResultsPanel } from './components/ResultsPanel'
import { HomePage } from './components/HomePage'
import { HeaderNav } from './components/HeaderNav'
import { GitHubAuthModal } from './components/GitHubAuthModal'
import { RepoSelector } from './components/RepoSelector'
import { PersistentHistoryDrawer } from './components/PersistentHistoryDrawer'
import { getCurrentUser, logoutUser } from './services/apiService'
import { useTheme } from './hooks/useTheme'
import type { GitHubUser, Analysis } from './types'

const demoUrl = 'https://github.com/raghavacse2024-dotcom/codegenome-ai'
const agents = ['Architecture', 'Technical Debt', 'Risk & Cost', 'Refactor Planner', 'Review']
const sections = [
  { id: 'analyze', label: 'Command Prompt' },
  { id: 'workflow', label: 'Multi-Agent Network' },
  { id: 'results', label: 'Telemetry Report' },
]

export default function App() {
  useTheme()
  const [view, setView] = useState<'home' | 'cockpit'>('home')
  const [url, setUrl] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [user, setUser] = useState<GitHubUser | null>(() => {
    try {
      const cached = localStorage.getItem('codegenome_github_user')
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const { run, results: analysis, loading, error, setLoadedAnalysis, streamEvents, streamStatus } = useAnalysis()
  const currentEvents = useMemo(() => {
    if (loading && streamEvents.length > 0) {
      return streamEvents
    }
    return analysis?.events || []
  }, [loading, streamEvents, analysis])
  const activeSection = useScrollSpy(sections.map((section) => section.id))

  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem('codegenome_github_user', JSON.stringify(user))
      } catch {}
    } else {
      try {
        localStorage.removeItem('codegenome_github_user')
      } catch {}
    }
  }, [user])

  useEffect(() => {
    // Check if user has an existing session
    getCurrentUser()
      .then((res) => {
        if (res.authenticated && res.user) {
          setUser(res.user)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [loading])

  async function analyze(targetUrl?: string, event?: FormEvent) {
    event?.preventDefault()
    const urlToRun = targetUrl || url
    if (targetUrl) {
      setUrl(targetUrl)
    }
    try {
      await run(urlToRun)
    } catch {
      // The hook owns the user-facing error message.
    }
  }

  const handleLaunchCockpit = (repoUrl?: string) => {
    setView('cockpit')
    window.scrollTo(0, 0)
    if (repoUrl) {
      setUrl(repoUrl)
      analyze(repoUrl)
    }
  }

  const completed = agents.filter((agent) => currentEvents.some((entry) => entry.agent === agent && entry.status === 'complete')).length
  const progress = analysis ? 100 : loading ? Math.max((completed / agents.length) * 100, 6) : 0
  const status = loading ? 'Analyzing' : analysis ? (analysis.isDemo ? 'Demo mode' : 'Live mode') : 'Ready'
  const statusTone = loading ? 'is-busy' : analysis ? (analysis.isDemo ? 'is-demo' : 'is-live') : 'is-ready'

  // Motion variants
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1] as const,
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4 } }
  }

  return (
    <div className="app-shell-root">
      <HeaderNav 
        currentView={view}
        onSelectView={(v) => {
          setView(v)
          window.scrollTo(0, 0)
        }}
        onLaunchCockpit={() => handleLaunchCockpit()}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={async () => {
          await logoutUser()
          setUser(null)
        }}
      />

      <GitHubAuthModal 
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(loggedUser) => setUser(loggedUser)}
      />

      <AnimatePresence mode="wait">
        {view === 'home' ? (
          <motion.div
            key="home-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'linear' }}
          >
            <HomePage onLaunchCockpit={handleLaunchCockpit} />
          </motion.div>
        ) : (
          <motion.main 
            key="cockpit-page"
            className="shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'linear' }}
          >
            <section className="workspace">
              <header className="topbar">
                <div className="topbar-copy">
                  <p className="eyebrow"><LayoutDashboard size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> Multi-agent telemetry</p>
                  <h1 style={{ color: 'var(--text-main, #ffffff)', opacity: 1, fontWeight: 700 }}>Initialize repository intelligence network.</h1>
                </div>
              </header>

              <motion.section 
                className={`command-panel command-panel-centered${loading ? ' is-busy' : ''}`} 
                id="analyze"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="command-copy">
                  <p className="eyebrow"><Terminal size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> SYS.INPUT</p>
                  <h2>Target GitHub repository.</h2>
                  <p className="command-lede">Deploy the agent network to map architecture, price technical debt, and compile a refactor scaffold.</p>
                  {!user && (
                    <div className="command-auth-link">
                      <button 
                        type="button" 
                        className="hint-auth-btn"
                        onClick={() => setAuthModalOpen(true)}
                        style={{ background: 'none', border: 'none', color: 'var(--neon)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline', fontSize: '11px', fontFamily: 'DM Mono, monospace' }}
                      >
                        SIGN IN FOR PRIVATE REPOS
                      </button>
                    </div>
                  )}
                </div>

                <form className="repo-form" onSubmit={(e) => analyze(undefined, e)} aria-busy={loading || undefined}>
                  <label htmlFor="repo">TARGET_URL {user ? `(AUTHENTICATED AS @${user.login.toUpperCase()})` : ''}</label>
                  <div className="repo-input-row">
                    <input
                      id="repo"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://github.com/owner/repository"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button className="run-button" disabled={loading}>
                      {loading ? (
                        <><span className="spinner" aria-hidden="true" />ANALYZING</>
                      ) : (
                        <><Play size={14} /> INITIALIZE</>
                      )}
                    </button>
                  </div>

                  {user && (
                    <RepoSelector 
                      currentUrl={url}
                      onSelectRepo={(selectedUrl) => {
                        setUrl(selectedUrl)
                      }}
                    />
                  )}

                  {loading && (
                    <div className="scan">
                      <div className="scan-track"><motion.i initial={{width: 0}} animate={{width: `${progress}%`}} transition={{duration: 0.5}} /></div>
                      <span>
                        T+{elapsed}s · {completed}/{agents.length} nodes active
                        {streamStatus && <span style={{ marginLeft: 8, color: 'var(--neon)', opacity: 0.9 }}>· {streamStatus}</span>}
                      </span>
                    </div>
                  )}
                </form>
              </motion.section>

              <div className="database-scans-section" style={{ marginTop: '24px', marginBottom: '24px', padding: '20px', background: 'var(--card-bg, rgba(20, 20, 30, 0.6))', borderRadius: '14px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
                <div style={{ marginBottom: '12px' }}>
                  <p className="eyebrow" style={{ fontSize: '11px', letterSpacing: '0.05em', color: 'var(--neon)', textTransform: 'uppercase', marginBottom: '4px' }}>PERSISTENT STORAGE</p>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Cloud Firestore Scans & Database Records</h3>
                </div>
                <PersistentHistoryDrawer 
                  currentAnalysisId={analysis?.analysisId}
                  onSelectAnalysis={(saved) => {
                    setLoadedAnalysis(saved)
                    if (saved.repo?.url) setUrl(saved.repo.url)
                  }}
                  onSelectUrl={(selectedUrl) => setUrl(selectedUrl)}
                />
              </div>

              <section className="workflow-board" id="workflow">
                <div className="section-title">
                  <div>
                    <p className="eyebrow"><Cpu size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> AGENT NETWORK</p>
                    <h2>Execution nodes</h2>
                  </div>
                  <span className="section-badge">
                    {loading ? `STREAMING SSE · ${completed}/${agents.length}` : analysis ? 'COMPLETED' : 'STANDBY'}
                  </span>
                </div>

                <motion.div 
                  className="agent-strip" 
                  style={{ '--progress': progress } as CSSProperties}
                  variants={containerVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                >
                  {agents.map((agent, index) => {
                    const completeLog = currentEvents.find((entry) => entry.agent === agent && entry.status === 'complete')
                    const runningLog = currentEvents.find((entry) => entry.agent === agent && entry.status === 'running')
                    const isDone = Boolean(completeLog)
                    const isRunning = !isDone && (Boolean(runningLog) || (loading && index === completed))
                    const state = isDone ? 'is-done' : isRunning ? 'is-active' : 'is-idle'
                    const label = isDone ? 'DONE' : isRunning ? 'PROCESSING' : 'QUEUED'
                    const note = completeLog?.rationale || runningLog?.rationale || (isRunning ? 'Compiling telemetry data...' : 'Awaiting signal.')
                    return (
                      <motion.article 
                        className={`agent-card ${state}`} 
                        key={agent} 
                        style={{ '--i': index } as CSSProperties}
                        variants={itemVariants}
                        layout
                      >
                        <span className="agent-index" aria-hidden="true">
                          {isDone ? <CheckSquare size={14}/> : String(index + 1).padStart(2, '0')}
                        </span>
                        <strong className="agent-name">{agent}</strong>
                        <p className="agent-note">
                          {note}
                        </p>
                        {isRunning && <span className="agent-skeleton" aria-hidden="true"><i /><i /></span>}
                        <i className="agent-state">{label}</i>
                      </motion.article>
                    )
                  })}
                </motion.div>
              </section>

              <AnimatePresence>
                {error && (
                  <motion.section 
                    className="error-panel" 
                    role="alert"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <span className="error-icon" aria-hidden="true"><AlertTriangle size={16}/></span>
                    <div>
                      <strong>SYSTEM ERROR.</strong>
                      <p>{error}</p>
                      <small>Verify repository access permissions. Rate limits may apply.</small>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              <section className="results-region" id="results">
                {analysis && <ResultsPanel analysis={analysis} />}
              </section>
            </section>
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  )
}

