import { useState } from 'react'
import type { CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, FileCode, Server, Activity, ArrowRight, ShieldCheck, Zap, Code2, Network, GitPullRequest, GitBranch, FileDiff as FileDiffIcon } from 'lucide-react'
import type { Analysis, Scaffold, Hotspot } from '../types'
import { useCountUp } from '../hooks/useCountUp'
import { DemoModeBadge } from './DemoModeBadge'
import { DownloadButton } from './DownloadButton'
import { RepositoryQA } from './RepositoryQA'
import { AstAnalysisDetailModal } from './AstAnalysisDetailModal'
import { GitDiffViewer } from './GitDiffViewer'
import { AutomatedPrModal } from './AutomatedPrModal'

function ScaffoldCard({ file, index }: { file: Scaffold; index: number }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <motion.article 
      className={`code-card reveal${copied ? ' is-copied' : ''}`} 
      style={{ '--i': index } as CSSProperties}
      whileHover={{ y: -3, boxShadow: '0 24px 50px -30px rgba(0, 0, 0, .9)', borderColor: 'rgba(125, 243, 195, .35)' }}
    >
      <div className="code-head">
        <span className="code-path"><FileCode size={12} style={{display: 'inline', marginRight: 6, verticalAlign: 'middle'}}/>{file.path}</span>
        <button className="copy-button" type="button" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre>{file.content}</pre>
    </motion.article>
  )
}

export function ResultsPanel({ analysis }: { analysis: Analysis }) {
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null)
  const [prModalOpen, setPrModalOpen] = useState(false)
  const [refactorTab, setRefactorTab] = useState<'diff' | 'scaffolds'>('diff')
  const { architecture, debt, cost, refactor, review } = analysis.results
  const rawLanguages = (architecture.data.structure.languages || []) as any[]
  const languages: [string, number][] = rawLanguages.map((item) => {
    if (Array.isArray(item)) return [String(item[0]), Number(item[1]) || 0]
    if (item && typeof item === 'object') {
      if (item._arr && Array.isArray(item.items)) {
        return [String(item.items[0]), Number(item.items[1]) || 0]
      }
      return [String(item.language || item.name || 'Other'), Number(item.count) || 0]
    }
    return [String(item), 1]
  })
  const maxLanguage = Math.max(1, ...languages.map(([, count]) => count))

  const debtScore = useCountUp(debt.data.totalDebtScore)
  const annualCost = useCountUp(cost.data.annualCost, 1300)
  const payback = useCountUp(cost.data.roiMonths, 900)
  const risk = Math.min(100, Math.max(6, debt.data.totalDebtScore))

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const panelVariant = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
  }

  return (
    <motion.section 
      className="report"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <DemoModeBadge isDemo={analysis.isDemo} />

      <section className="score-row">
        <motion.article className="score-card" variants={panelVariant}>
          <span>Debt Score</span>
          <strong>{debtScore}<small>/100</small></strong>
          <p className="score-foot">{debt.data.summary}</p>
        </motion.article>
        <motion.article className="score-card" variants={panelVariant}>
          <span>Annual Drag</span>
          <strong>${annualCost.toLocaleString()}</strong>
          <p className="score-foot">{cost.data.assumption}</p>
        </motion.article>
        <motion.article className="score-card" variants={panelVariant}>
          <span>Payback Window</span>
          <strong>{payback}<small>mo</small></strong>
          <p className="score-foot">{cost.data.priority} priority refactor</p>
        </motion.article>
        <motion.article className="score-card score-card--verified" variants={panelVariant}>
          <span>Review Verdict</span>
          <strong>{review.data.verdict}</strong>
          <p className="score-foot">{review.data.checks.length} self-review checks</p>
        </motion.article>
      </section>

      <section className="report-grid">
        <motion.article className="panel panel--wide" variants={panelVariant}>
          <div className="panel-head">
            <p className="eyebrow"><Server size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> Architecture map</p>
            <span className="panel-tag">{architecture.data.framework}</span>
          </div>
          <h2>{architecture.data.summary}</h2>
          <div className="layer-row">
            {architecture.data.layers.map((layer) => <span key={layer}>{layer}</span>)}
          </div>
          {architecture.data.violations.length > 0 && (
            <ul className="checklist checklist--warn">
              {architecture.data.violations.map((violation) => <li key={violation}>{violation}</li>)}
            </ul>
          )}
        </motion.article>

        <motion.article className="panel" variants={panelVariant}>
          <div className="panel-head">
            <p className="eyebrow"><Activity size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> Footprint</p>
            <span className="panel-tag">{architecture.data.structure.sampledFileCount} files</span>
          </div>
          <p className="panel-copy">{architecture.data.structure.rootDirectories.join(' / ') || 'Flat source structure'}</p>
          <div className="language-list">
            {languages.length ? languages.map(([language, count], index) => (
              <div className="language-row" key={language} style={{ '--i': index, '--to': `${(count / maxLanguage) * 100}%` } as CSSProperties}>
                <span>{language}</span>
                <span className="language-bar" aria-hidden="true"><motion.i initial={{width: 0}} animate={{width: '100%'}} transition={{duration: 1, delay: 0.2 + (index * 0.1)}} /></span>
                <b>{count}</b>
              </div>
            )) : <p className="empty-state">No language sample in this repository.</p>}
          </div>
        </motion.article>

        <motion.article className="panel" variants={panelVariant}>
          <div className="panel-head">
            <p className="eyebrow"><Zap size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> Risk &amp; cost</p>
            <span className="panel-tag">{cost.data.priority}</span>
          </div>
          <p className="panel-copy">{cost.data.assumption}</p>
          <div className="meter" style={{ '--to': `${risk}%` } as CSSProperties}>
            <motion.i initial={{width: 0}} animate={{width: `${risk}%`}} transition={{duration: 1.3, delay: 0.35, ease: "easeOut"}} />
            <span className="meter-scale" aria-hidden="true">0%<b>100%</b></span>
          </div>
        </motion.article>
      </section>

      <motion.section className="panel" variants={panelVariant}>
        <div className="panel-head">
          <div>
            <p className="eyebrow"><Code2 size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> Technical debt &amp; AST Analysis</p>
            <h2>Evidence, not guesswork</h2>
          </div>
          <div className="panel-head-badges">
            {debt.data.astAnalyzedCount !== undefined && debt.data.astAnalyzedCount > 0 && (
              <span className="ast-badge" title="Verified via TypeScript Abstract Syntax Tree engine">
                <Zap size={11} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/>
                AST Engine: {debt.data.astAnalyzedCount} AST trees (avg v(G) = {debt.data.avgCyclomaticComplexity})
              </span>
            )}
            <span className="panel-tag">{debt.data.summary}</span>
          </div>
        </div>
        <div className="hotspot-table">
          {debt.data.hotspots.length ? debt.data.hotspots.map((hotspot, index) => (
            <motion.article 
              className="hotspot-row hotspot-row--interactive" 
              key={hotspot.path} 
              style={{ '--i': index } as CSSProperties}
              whileHover={{ x: 3, backgroundColor: 'rgba(125, 243, 195, .06)' }}
              onClick={() => setSelectedHotspot(hotspot)}
              role="button"
              tabIndex={0}
              title="Click to view detailed Abstract Syntax Tree (AST) breakdown"
            >
              <div className="hotspot-path">
                <div className="hotspot-path-title">
                  <strong>{hotspot.path}</strong>
                  {hotspot.ast && (
                    <span className="ast-pill">
                      v(G) {hotspot.ast.cyclomaticComplexity} · {hotspot.ast.functionCount} fn{hotspot.ast.functionCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <p>{hotspot.signals.join(' / ') || 'complexity signal'}</p>
              </div>
              <span className="hotspot-bar" aria-hidden="true"><motion.i initial={{width: 0}} animate={{width: `${Math.min(100, Math.max(4, hotspot.score))}%`}} transition={{duration: 0.9, delay: 0.25 + (index * 0.05)}} /></span>
              <b className="hotspot-score">{hotspot.score}</b>
              <div className="hotspot-meta-col">
                <span className="hotspot-meta">{hotspot.lines} lines</span>
                <span className="ast-inspect-hint">Inspect AST &rarr;</span>
              </div>
            </motion.article>
          )) : <p className="empty-state">No major static-analysis hotspots in the sampled files.</p>}
        </div>
      </motion.section>

      <motion.section className="panel" variants={panelVariant}>
        <div className="panel-head action-head">
          <div>
            <p className="eyebrow">Refactor package</p>
            <h2>{refactor.data.pullRequestTitle}</h2>
          </div>
          <div className="action-buttons-group">
            <button
              type="button"
              className="pr-trigger-btn"
              onClick={() => setPrModalOpen(true)}
              title="Create automated Pull Request on GitHub"
            >
              <GitPullRequest size={13} style={{ marginRight: 6 }} />
              Automate PR
            </button>
            <DownloadButton analysisId={analysis.analysisId} />
          </div>
        </div>
        <ol className="steps">
          {refactor.data.steps.map((step, idx) => (
            <motion.li 
              key={step}
              whileHover={{ x: 3, backgroundColor: 'rgba(15, 32, 48, .8)', borderColor: 'rgba(125, 243, 195, .3)' }}
            >
              {step}
            </motion.li>
          ))}
        </ol>

        {/* View Switcher: Git Diff vs Scaffold files */}
        <div className="refactor-nav-tabs">
          <button
            type="button"
            className={`refactor-tab-btn ${refactorTab === 'diff' ? 'is-active' : ''}`}
            onClick={() => setRefactorTab('diff')}
          >
            <FileDiffIcon size={12} />
            <span>Interactive Git Diff</span>
            {refactor.data.diff && (
              <span className="diff-pill diff-pill--add" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>
                +{refactor.data.diff.summary.additions} / -{refactor.data.diff.summary.deletions}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`refactor-tab-btn ${refactorTab === 'scaffolds' ? 'is-active' : ''}`}
            onClick={() => setRefactorTab('scaffolds')}
          >
            <FileCode size={12} />
            <span>Scaffold Files ({refactor.data.scaffolds.length})</span>
          </button>
        </div>

        {refactorTab === 'diff' && refactor.data.diff ? (
          <GitDiffViewer
            diff={refactor.data.diff}
            analysisId={analysis.analysisId}
            onOpenPrModal={() => setPrModalOpen(true)}
          />
        ) : (
          <div className="code-grid">
            {refactor.data.scaffolds.map((file, index) => <ScaffoldCard file={file} index={index} key={file.path} />)}
          </div>
        )}
      </motion.section>

      <section className="report-grid">
        <motion.article className="panel" variants={panelVariant}>
          <div className="panel-head">
            <p className="eyebrow"><ShieldCheck size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'middle'}}/> Self review</p>
            <span className="panel-tag">{review.data.verdict}</span>
          </div>
          <ul className="checklist">
            {review.data.checks.map((check) => <li key={check}>{check}</li>)}
          </ul>
          {review.data.caveat && <p className="caveat">{review.data.caveat}</p>}
        </motion.article>

        <motion.article className="panel" variants={panelVariant}>
          <div className="panel-head">
            <p className="eyebrow">Repository Q&amp;A</p>
            <span className="panel-tag">Grounded</span>
          </div>
          <RepositoryQA analysisId={analysis.analysisId} />
        </motion.article>
      </section>

      <AnimatePresence>
        {selectedHotspot && (
          <AstAnalysisDetailModal
            hotspot={selectedHotspot}
            onClose={() => setSelectedHotspot(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {prModalOpen && (
          <AutomatedPrModal
            analysis={analysis}
            onClose={() => setPrModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.section>
  )
}
