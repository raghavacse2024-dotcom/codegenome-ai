import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  GitPullRequest,
  X,
  GitBranch,
  CheckCircle,
  ExternalLink,
  Copy,
  Check,
  Download,
  AlertCircle,
  Terminal,
  FileCode,
  Loader2,
  Key,
} from 'lucide-react'
import type { Analysis, PullRequestResult } from '../types'
import { createAutomatedPullRequest, downloadGitPatch } from '../services/apiService'
import { GitHubAuthModal } from './GitHubAuthModal'

interface AutomatedPrModalProps {
  analysis: Analysis
  onClose: () => void
}

export function AutomatedPrModal({ analysis, onClose }: AutomatedPrModalProps) {
  const { repo, results } = analysis
  const refactorData = results.refactor.data
  const targetPath = refactorData.target || 'src/feature.ts'
  const safeName = targetPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'feature'

  const [baseBranch, setBaseBranch] = useState(repo.defaultBranch || 'main')
  const [branch, setBranch] = useState(
    `codegenome/refactor-${safeName}-${Date.now().toString(36)}`
  )
  const [title, setTitle] = useState(refactorData.pullRequestTitle || `refactor: modularize ${targetPath}`)
  const [body, setBody] = useState(
    `## CodeGenome AI: Automated Refactor\n\n### Summary\n- **Target Hotspot**: \`${targetPath}\`\n- **Base Branch**: \`${repo.defaultBranch || 'main'}\`\n- **Refactor Objective**: Reduce high cyclomatic complexity and decouple monolithic dependencies into a cohesive modular unit.\n\n### Key Changes\n${refactorData.steps.map((s) => `- ${s}`).join('\n')}\n\n### Verification\n${results.review.data.checks.map((c) => `- [x] ${c}`).join('\n')}\n\n---\n*Generated automatically by [CodeGenome AI](https://codegenome.ai)*`
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PullRequestResult | null>(null)
  const [copiedCli, setCopiedCli] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Close modal on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await createAutomatedPullRequest({
        analysisId: analysis.analysisId,
        title,
        branch,
        body,
        baseBranch,
      })
      setResult(res)
    } catch (err: any) {
      setError(err?.message || 'Failed to generate Pull Request.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopyCli(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd)
      setCopiedCli(true)
      setTimeout(() => setCopiedCli(false), 2000)
    } catch {}
  }

  const diffSummary = refactorData.diff?.summary

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        className="modal-card pr-modal-card"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-modal-title"
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-icon-badge modal-icon-badge--pr">
              <GitPullRequest size={16} />
            </div>
            <div>
              <h3 id="pr-modal-title" className="modal-title">
                Automated Pull Request
              </h3>
              <p className="modal-subtitle">
                {repo.owner}/{repo.repository}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body pr-modal-body">
          {error && (
            <div className="pr-error-banner">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {result ? (
            /* Result State */
            <div className="pr-result-view">
              <div
                className={`pr-result-status ${
                  result.mode === 'live' ? 'status-live' : 'status-simulated'
                }`}
              >
                <div className="pr-result-icon">
                  {result.mode === 'live' ? (
                    <CheckCircle size={28} className="text-neon" />
                  ) : (
                    <GitPullRequest size={28} className="text-cyan" />
                  )}
                </div>
                <div className="pr-result-text">
                  <h4>
                    {result.mode === 'live'
                      ? 'Pull Request Created on GitHub!'
                      : 'Pull Request Bundle Ready'}
                  </h4>
                  <p>{result.message}</p>
                </div>
              </div>

              {/* Branch comparison */}
              <div className="pr-branch-spec">
                <span className="branch-pill">
                  <GitBranch size={12} /> {result.baseBranch}
                </span>
                <span className="branch-arrow">&larr;</span>
                <span className="branch-pill branch-pill--new">
                  <GitBranch size={12} /> {result.branch}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pr-result-actions">
                {result.prUrl && (
                  <a
                    href={result.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pr-btn pr-btn--primary"
                  >
                    <ExternalLink size={14} />
                    <span>
                      {result.mode === 'live'
                        ? `View PR #${result.prNumber || ''} on GitHub`
                        : 'Review & Compare on GitHub'}
                    </span>
                  </a>
                )}

                {result.mode === 'simulated' && (
                  <button
                    type="button"
                    className="pr-btn pr-btn--secondary"
                    onClick={() => setShowAuthModal(true)}
                    style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
                  >
                    <Key size={14} />
                    <span>Connect GitHub Token (PAT)</span>
                  </button>
                )}

                <button
                  type="button"
                  className="pr-btn pr-btn--secondary"
                  onClick={() => downloadGitPatch(analysis.analysisId)}
                >
                  <Download size={14} />
                  <span>Download .patch</span>
                </button>
              </div>

              {/* CLI Command if applicable */}
              {result.cliCommand && (
                <div className="pr-cli-box">
                  <div className="pr-cli-head">
                    <span>
                      <Terminal size={12} /> Apply locally with Git CLI
                    </span>
                    <button
                      type="button"
                      className="pr-cli-copy"
                      onClick={() => handleCopyCli(result.cliCommand!)}
                    >
                      {copiedCli ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedCli ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <code>{result.cliCommand}</code>
                </div>
              )}
            </div>
          ) : (
            /* Creation Form */
            <form onSubmit={handleSubmit} className="pr-form">
              {diffSummary && (
                <div className="pr-diff-summary-bar">
                  <span>
                    <FileCode size={13} />
                    <strong>{diffSummary.filesChanged} files</strong> in refactor package
                  </span>
                  <div className="diff-stat-pills">
                    <span className="diff-pill diff-pill--add">+{diffSummary.additions}</span>
                    <span className="diff-pill diff-pill--del">-{diffSummary.deletions}</span>
                  </div>
                </div>
              )}

              <div className="pr-form-row">
                <div className="pr-form-field">
                  <label htmlFor="baseBranch">Base Branch</label>
                  <div className="input-with-icon">
                    <GitBranch size={13} className="input-icon" />
                    <input
                      id="baseBranch"
                      type="text"
                      value={baseBranch}
                      onChange={(e) => setBaseBranch(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="pr-form-field">
                  <label htmlFor="newBranch">Automated Branch</label>
                  <div className="input-with-icon">
                    <GitBranch size={13} className="input-icon" />
                    <input
                      id="newBranch"
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="pr-form-field">
                <label htmlFor="prTitle">Pull Request Title</label>
                <input
                  id="prTitle"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="pr-form-field">
                <label htmlFor="prBody">Pull Request Description (Markdown)</label>
                <textarea
                  id="prBody"
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
              </div>

              <div className="pr-form-footer">
                <button
                  type="button"
                  className="pr-btn pr-btn--secondary"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pr-btn pr-btn--primary"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="spin-icon" />
                      <span>Creating PR...</span>
                    </>
                  ) : (
                    <>
                      <GitPullRequest size={14} />
                      <span>Create Pull Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>

      <GitHubAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false)
          // Re-submit PR request with newly attached token
          const fakeEvt = { preventDefault: () => {} } as React.FormEvent
          handleSubmit(fakeEvt)
        }}
      />
    </div>
  )
}
