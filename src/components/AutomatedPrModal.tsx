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
  ShieldAlert,
  AlertTriangle,
  FileText,
  BookOpen,
} from 'lucide-react'
import type { Analysis, PullRequestResult, PrState } from '../types'
import { createAutomatedPullRequest, downloadGitPatch, getSessionToken, getGitHubPat, setGitHubPat, registerSession } from '../services/apiService'
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
  const [patInput, setPatInput] = useState(getGitHubPat() || '')
  const [forceShowPat, setForceShowPat] = useState(false)
  const [confirmedHighRisk, setConfirmedHighRisk] = useState(false)

  const initialPolicy = refactorData.policy || results.review.data.policy
  const initialPrState: PrState = refactorData.state || results.review.data.state || (initialPolicy?.isBlocked ? 'PR_BLOCKED' : 'PR_ELIGIBLE')

  const currentState: PrState = result?.state || initialPrState
  const currentPolicy = result?.policy || initialPolicy || { isBlocked: false, policyFile: null, ruleSnippet: null, explanation: '' }
  const isBlocked = currentState === 'PR_BLOCKED' || Boolean(currentPolicy.isBlocked)
  const isHumanReviewRequired = currentState === 'HUMAN_REVIEW_REQUIRED'
  const isValidationFailed = currentState === 'VALIDATION_FAILED'

  const pat = getGitHubPat()
  const isGoogleOrFallbackSession = Boolean(
    getSessionToken() && 
    (getSessionToken()?.startsWith('cg_google_') || getSessionToken()?.includes('google') || getSessionToken()?.includes('fallback'))
  )
  const hasWriteToken = Boolean(pat || (getSessionToken() && !isGoogleOrFallbackSession))

  function openPrUrl(url: string) {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

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

    if (isBlocked) {
      setError(currentPolicy.explanation || 'Pull request creation is blocked by repository contribution policy.')
      return
    }

    if (isHumanReviewRequired && !confirmedHighRisk) {
      setError('Explicit human review and confirmation is required before submitting.')
      return
    }

    setLoading(true)
    setError(null)

    // Save PAT if entered in-form
    const cleanPat = patInput.trim()
    if (cleanPat) {
      setGitHubPat(cleanPat)
      const sess = getSessionToken()
      if (sess) {
        await registerSession(sess, undefined, cleanPat).catch(() => null)
      }
    }

    try {
      const res = await createAutomatedPullRequest({
        analysisId: analysis.analysisId,
        title,
        branch,
        body,
        baseBranch,
        confirmedHighRisk,
      })
      setResult(res)
      if (res.pushed && res.prUrl) {
        openPrUrl(res.prUrl)
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to generate Pull Request.'
      setError(errMsg)
      setForceShowPat(true)
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
  const defaultCliCommand = `git checkout -b ${branch} && git apply --whitespace=fix codegenome-refactor.patch`

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
            <div className={`modal-icon-badge ${isBlocked ? 'modal-icon-badge--danger' : 'modal-icon-badge--pr'}`}>
              {isBlocked ? <ShieldAlert size={16} /> : <GitPullRequest size={16} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="pr-modal-title" className="modal-title">
                  {isBlocked ? 'Repository Contribution Policy' : 'Automated Pull Request'}
                </h3>
                {/* Explicit State Pill */}
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase ${
                  currentState === 'PR_BLOCKED'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : currentState === 'HUMAN_REVIEW_REQUIRED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : currentState === 'VALIDATION_FAILED'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {currentState}
                </span>
              </div>
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

          {/* Blocked by Repository Contribution Policy State */}
          {isBlocked && (
            <div className="p-4 mb-4 rounded-xl bg-red-950/40 border border-red-500/40 text-sm flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-red-500/20 text-red-400 flex-shrink-0 mt-0.5">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-red-200 text-sm mb-1">
                    PR Creation Blocked by Repository Policy
                  </h4>
                  <p className="text-red-300/90 text-xs leading-relaxed mb-2">
                    {currentPolicy.explanation || `This repository's ${currentPolicy.policyFile || 'AGENTS.md'} strictly prohibits automated or AI-generated pull requests.`}
                  </p>
                  {currentPolicy.ruleSnippet && (
                    <div className="p-2 rounded bg-black/50 border border-red-500/30 text-xs font-mono text-red-200">
                      &ldquo;{currentPolicy.ruleSnippet}&rdquo;
                    </div>
                  )}
                  <p className="text-slate-400 text-xs mt-2">
                    CodeGenome AI honors maintainer rules and will <strong>not</strong> open automated pull requests against this repository. You may inspect the proposed diff, export the patch, and submit changes manually if permitted.
                  </p>
                </div>
              </div>

              {/* Manual Continuation & Export Options */}
              <div className="pt-3 border-t border-red-500/20 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  className="pr-btn pr-btn--primary"
                  onClick={() => downloadGitPatch(analysis.analysisId)}
                >
                  <Download size={14} />
                  <span>Download .patch File</span>
                </button>
                <button
                  type="button"
                  className="pr-btn pr-btn--secondary"
                  onClick={() => handleCopyCli(defaultCliCommand)}
                >
                  {copiedCli ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedCli ? 'Copied CLI Command' : 'Copy CLI Patch Command'}</span>
                </button>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-slate-800 text-xs flex flex-col gap-1 text-slate-300">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <BookOpen size={13} className="text-emerald-400" /> How to continue manually:
                </span>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1 mt-1">
                  <li>Download or copy the unified patch above.</li>
                  <li>Review the diff locally and adapt it according to <code>{currentPolicy.policyFile || 'CONTRIBUTING.md'}</code>.</li>
                  <li>Follow the project&apos;s human submission guidelines without using automated tooling.</li>
                </ol>
              </div>
            </div>
          )}

          {/* Validation Failed Notice */}
          {isValidationFailed && !isBlocked && (
            <div className="p-3.5 mb-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold text-rose-200 block mb-0.5">Refactor Validation Failed</strong>
                <span>The refactoring proposal did not pass isolated validation checks. Inspect the diff or run validation again to ensure syntax and test framework compatibility.</span>
              </div>
            </div>
          )}

          {/* Human Review Required Notice */}
          {isHumanReviewRequired && !isBlocked && (
            <div className="p-3.5 mb-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold text-amber-100 block mb-0.5">Explicit Human Review Required</strong>
                  <span>This refactor touches high-impact repository files (e.g. CI/CD workflows, configuration, or large diffs). Automated PRs cannot be proposed without explicit human confirmation.</span>
                </div>
              </div>
              <label className="flex items-center gap-2 mt-1 cursor-pointer select-none text-slate-200 font-medium">
                <input
                  type="checkbox"
                  checked={confirmedHighRisk}
                  onChange={(e) => setConfirmedHighRisk(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0"
                />
                <span>I have manually reviewed the proposed changes and approve creating this Pull Request.</span>
              </label>
            </div>
          )}

          {result ? (
            /* Result State */
            <div className="pr-result-view">
              <div className="pr-result-status status-live">
                <div className="pr-result-icon">
                  <CheckCircle size={28} className="text-neon" />
                </div>
                <div className="pr-result-text">
                  <h4>
                    {result.prNumber
                      ? `Pull Request #${result.prNumber} Created!`
                      : 'Pull Request Ready for GitHub!'}
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
                      {result.prNumber
                        ? `View PR #${result.prNumber} on GitHub`
                        : 'Review & Submit PR on GitHub'}
                    </span>
                  </a>
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
                      disabled={isBlocked}
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
                      disabled={isBlocked}
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
                  disabled={isBlocked}
                  required
                />
              </div>

              <div className="pr-form-field">
                <label htmlFor="prBody">Pull Request Description (Markdown)</label>
                <textarea
                  id="prBody"
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={isBlocked}
                  required
                />
              </div>

              {!isBlocked && (
                <>
                  {hasWriteToken ? (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#064e3b]/30 border border-[#059669]/40 mb-4 text-xs text-[#34d399]">
                      <CheckCircle size={16} className="text-[#39f3c3] flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-white">GitHub Write Permissions Active:</span>{' '}
                        <span>Your session has repository write access authorized. CodeGenome will automatically fork, push the branch, and open your live Pull Request on GitHub.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-[#081b26] border border-[#164e63]/30 mb-4 text-sm">
                      <div className="flex items-start gap-2 text-xs text-cyan-200">
                        <AlertCircle size={15} className="text-[#39f3c3] flex-shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold block mb-0.5 text-white">GitHub Write Authorization (For Live PR)</strong>
                          To push the refactored branch to GitHub and create a live Pull Request, GitHub requires authorization with <code>repo</code> scope.
                          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setShowAuthModal(true)}
                              style={{
                                padding: '6px 12px',
                                background: '#24292e',
                                border: '1px solid #39f3c3',
                                borderRadius: '6px',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <GitBranch size={12} className="text-[#39f3c3]" />
                              <span>1-Click Authorize with GitHub (Write Access)</span>
                            </button>
                            <a 
                              href="https://github.com/settings/tokens/new?scopes=repo&description=CodeGenome+AI+PR+Integration" 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{ color: '#39f3c3', textDecoration: 'underline', fontSize: '11px' }}
                            >
                              Or generate token on GitHub &rarr;
                            </a>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <div className="input-with-icon" style={{ position: 'relative' }}>
                          <Key size={13} className="input-icon" style={{ position: 'absolute', left: '10px', top: '11px', color: '#94a3b8' }} />
                          <input
                            type="password"
                            placeholder="Paste your GitHub Personal Access Token (ghp_...) [Optional]"
                            value={patInput}
                            onChange={(e) => setPatInput(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px 8px 32px',
                              background: 'rgba(0,0,0,0.5)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '13px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="pr-form-footer">
                <button
                  type="button"
                  className="pr-btn pr-btn--secondary"
                  onClick={onClose}
                  disabled={loading}
                >
                  Close
                </button>
                {isBlocked ? (
                  <button
                    type="button"
                    className="pr-btn pr-btn--secondary opacity-60 cursor-not-allowed"
                    disabled
                    title={currentPolicy.explanation}
                  >
                    <ShieldAlert size={14} className="text-red-400" />
                    <span>PR Blocked by Policy</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="pr-btn pr-btn--primary"
                    disabled={loading || (isHumanReviewRequired && !confirmedHighRisk) || isValidationFailed}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} className="spin-icon animate-spin" />
                        <span>{hasWriteToken || patInput.trim() ? 'Pushing Branch & Creating PR...' : 'Compiling Refactor Package...'}</span>
                      </>
                    ) : hasWriteToken || patInput.trim() ? (
                      <>
                        <GitPullRequest size={14} />
                        <span>Fork, Push & Create Live PR</span>
                      </>
                    ) : (
                      <>
                        <GitPullRequest size={14} />
                        <span>Generate Patch & Prepare PR</span>
                      </>
                    )}
                  </button>
                )}
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
        }}
      />
    </div>
  )
}
