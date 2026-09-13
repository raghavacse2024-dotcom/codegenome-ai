import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitCommit, Layers, Code2, AlertTriangle, ChevronDown, ChevronUp, Network, Zap } from 'lucide-react'
import type { Hotspot } from '../types'

interface AstAnalysisDetailModalProps {
  hotspot: Hotspot | null
  onClose: () => void
}

export function AstAnalysisDetailModal({ hotspot, onClose }: AstAnalysisDetailModalProps) {
  if (!hotspot) return null

  const ast = hotspot.ast
  const complexityLevel = !ast ? 'N/A' : ast.cyclomaticComplexity > 20 ? 'High' : ast.cyclomaticComplexity > 10 ? 'Moderate' : 'Low'
  const complexityColor = complexityLevel === 'High' ? 'var(--warn)' : complexityLevel === 'Moderate' ? 'var(--cyan)' : 'var(--neon)'

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <motion.div 
        className="auth-modal-card ast-detail-modal" 
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
      >
        <div className="auth-modal-header">
          <div className="auth-modal-title">
            <Code2 className="w-5 h-5 text-[var(--neon)]" />
            <h3>AST Deep Diagnostic</h3>
          </div>
          <button className="auth-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="ast-target-path">
          <code>{hotspot.path}</code>
          <span className="ast-score-badge">Debt Score: {hotspot.score}/100</span>
        </div>

        {/* Core AST Metric Grid */}
        <div className="ast-metrics-bento">
          <div className="ast-metric-tile">
            <span className="ast-metric-label">Cyclomatic Complexity</span>
            <strong className="ast-metric-val" style={{ color: complexityColor }}>
              v(G) = {ast?.cyclomaticComplexity ?? 1}
            </strong>
            <small className="ast-metric-sub">{complexityLevel} branching density</small>
          </div>

          <div className="ast-metric-tile">
            <span className="ast-metric-label">Max Nesting Depth</span>
            <strong className="ast-metric-val" style={{ color: (ast?.maxNestingDepth || 0) > 3 ? 'var(--warn)' : 'var(--neon)' }}>
              {ast?.maxNestingDepth ?? 1} levels
            </strong>
            <small className="ast-metric-sub">Block/control flow depth</small>
          </div>

          <div className="ast-metric-tile">
            <span className="ast-metric-label">AST Functions</span>
            <strong className="ast-metric-val">
              {ast?.functionCount ?? 0}
            </strong>
            <small className="ast-metric-sub">Declarations &amp; arrow expr</small>
          </div>

          <div className="ast-metric-tile">
            <span className="ast-metric-label">Coupling / Imports</span>
            <strong className="ast-metric-val">
              {ast?.importCount ?? 0}
            </strong>
            <small className="ast-metric-sub">Outgoing dependencies</small>
          </div>
        </div>

        {/* Synthesized AST Signals */}
        <div className="ast-signals-box">
          <h4>Parsed Syntactic Signals</h4>
          <ul className="checklist">
            {hotspot.signals.map((sig) => (
              <li key={sig}>{sig}</li>
            ))}
          </ul>
        </div>

        {/* Imported Specifiers */}
        {ast?.imports && ast.imports.length > 0 && (
          <div className="ast-imports-box">
            <h4>Sampled Dependency Imports ({ast.importCount})</h4>
            <div className="layer-row">
              {ast.imports.map((imp) => (
                <span key={imp}><code>{imp}</code></span>
              ))}
            </div>
          </div>
        )}

        {/* AST Insights Notice */}
        <div className="ast-insight-notice">
          <Zap className="w-4 h-4 text-[var(--neon)] shrink-0" />
          <p>
            Generated via full TypeScript compiler Abstract Syntax Tree node traversal. Measures McCabe cyclomatic branching, conditional nodes, function scope entries, and AST depth.
          </p>
        </div>

        <div className="auth-modal-footer">
          <button type="button" className="run-button auth-primary-btn" onClick={onClose}>
            Close AST Inspection
          </button>
        </div>
      </motion.div>
    </div>
  )
}
