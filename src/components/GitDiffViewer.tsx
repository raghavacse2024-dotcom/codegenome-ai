import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  GitCommit, 
  GitPullRequest, 
  Download, 
  Copy, 
  Check, 
  Columns, 
  AlignLeft, 
  FileCode, 
  Plus, 
  Minus,
  FileDiff as FileDiffIcon
} from 'lucide-react'
import type { RefactorGitDiff, FileDiff } from '../types'
import { downloadGitPatch } from '../services/apiService'

interface GitDiffViewerProps {
  diff: RefactorGitDiff
  analysisId: string
  onOpenPrModal?: () => void
}

export function GitDiffViewer({ diff, analysisId, onOpenPrModal }: GitDiffViewerProps) {
  const [activeFileIndex, setActiveFileIndex] = useState(0)
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified')
  const [copiedPatch, setCopiedPatch] = useState(false)

  const files = diff?.files || []
  const activeFile: FileDiff | undefined = files[activeFileIndex] || files[0]

  async function handleCopyPatch() {
    if (!diff?.rawPatch) return
    try {
      await navigator.clipboard.writeText(diff.rawPatch)
      setCopiedPatch(true)
      setTimeout(() => setCopiedPatch(false), 2000)
    } catch {
      setCopiedPatch(false)
    }
  }

  function handleDownloadPatch() {
    downloadGitPatch(analysisId)
  }

  if (!files.length) {
    return (
      <div className="diff-empty">
        <FileDiffIcon size={28} className="diff-empty-icon" />
        <p>No code diff available for this refactor.</p>
      </div>
    )
  }

  return (
    <div className="git-diff-container" id="git-diff-viewer">
      {/* Header bar */}
      <div className="diff-header">
        <div className="diff-header-left">
          <span className="diff-title">
            <FileDiffIcon size={14} className="diff-title-icon" />
            Git Diff Inspector
          </span>
          <div className="diff-stat-pills">
            <span className="diff-pill diff-pill--files">
              {diff.summary.filesChanged} file{diff.summary.filesChanged === 1 ? '' : 's'}
            </span>
            <span className="diff-pill diff-pill--add">
              +{diff.summary.additions}
            </span>
            <span className="diff-pill diff-pill--del">
              -{diff.summary.deletions}
            </span>
          </div>
        </div>

        <div className="diff-header-actions">
          {/* View mode toggle */}
          <div className="diff-view-toggle">
            <button
              type="button"
              className={`view-btn ${viewMode === 'unified' ? 'is-active' : ''}`}
              onClick={() => setViewMode('unified')}
              title="Unified diff view"
            >
              <AlignLeft size={13} />
              <span>Unified</span>
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === 'split' ? 'is-active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split side-by-side view"
            >
              <Columns size={13} />
              <span>Split</span>
            </button>
          </div>

          {/* Actions */}
          <button
            type="button"
            className="diff-action-btn"
            onClick={handleCopyPatch}
            title="Copy raw unified git diff"
          >
            {copiedPatch ? <Check size={13} /> : <Copy size={13} />}
            <span>{copiedPatch ? 'Copied' : 'Copy Patch'}</span>
          </button>

          <button
            type="button"
            className="diff-action-btn"
            onClick={handleDownloadPatch}
            title="Download .patch file"
          >
            <Download size={13} />
            <span>.patch</span>
          </button>

          {onOpenPrModal && (
            <button
              type="button"
              className="diff-action-btn diff-action-btn--pr"
              onClick={onOpenPrModal}
              title="Open Automated Pull Request dialog"
            >
              <GitPullRequest size={13} />
              <span>Automate PR</span>
            </button>
          )}
        </div>
      </div>

      {/* File selector tabs */}
      <div className="diff-file-tabs">
        {files.map((file, idx) => {
          const isActive = idx === activeFileIndex
          const statusClass = 
            file.status === 'added' 
              ? 'status--added' 
              : file.status === 'deleted' 
              ? 'status--deleted' 
              : 'status--modified'

          return (
            <button
              key={file.path}
              type="button"
              className={`diff-file-tab ${isActive ? 'is-active' : ''}`}
              onClick={() => setActiveFileIndex(idx)}
            >
              <span className={`diff-status-dot ${statusClass}`} />
              <span className="diff-file-path">{file.path}</span>
              <span className="diff-file-counts">
                {file.additions > 0 && <span className="add-count">+{file.additions}</span>}
                {file.deletions > 0 && <span className="del-count">-{file.deletions}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {/* Diff content view */}
      {activeFile && (
        <div className="diff-viewport">
          <div className="diff-file-meta">
            <span className="meta-path">
              <FileCode size={13} />
              {activeFile.path}
            </span>
            <span className={`meta-badge status--${activeFile.status}`}>
              {activeFile.status.toUpperCase()}
            </span>
          </div>

          <div className="diff-code-scroll">
            {viewMode === 'unified' ? (
              <div className="diff-unified-table">
                {activeFile.hunks.map((hunk, hIdx) => (
                  <div key={hIdx} className="diff-hunk-block">
                    <div className="diff-hunk-header">{hunk.header}</div>
                    {hunk.lines.map((line, lIdx) => (
                      <div key={lIdx} className={`diff-line diff-line--${line.type}`}>
                        <div className="line-num line-num--old">
                          {line.oldLineNumber ?? ''}
                        </div>
                        <div className="line-num line-num--new">
                          {line.newLineNumber ?? ''}
                        </div>
                        <div className="line-marker">
                          {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                        </div>
                        <div className="line-content">{line.content}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              /* Split View */
              <div className="diff-split-table">
                {activeFile.hunks.map((hunk, hIdx) => {
                  const leftLines = hunk.lines.filter((l) => l.type === 'del' || l.type === 'normal')
                  const rightLines = hunk.lines.filter((l) => l.type === 'add' || l.type === 'normal')
                  const maxLines = Math.max(leftLines.length, rightLines.length)

                  const rows = []
                  for (let i = 0; i < maxLines; i++) {
                    rows.push({
                      left: leftLines[i] || null,
                      right: rightLines[i] || null,
                    })
                  }

                  return (
                    <div key={hIdx} className="diff-hunk-block">
                      <div className="diff-hunk-header">{hunk.header}</div>
                      {rows.map((row, rIdx) => (
                        <div key={rIdx} className="diff-split-row">
                          {/* Left (Old/Deleted) */}
                          <div
                            className={`split-col split-col--left ${
                              row.left ? `diff-line--${row.left.type}` : 'diff-line--empty'
                            }`}
                          >
                            <span className="split-num">{row.left?.oldLineNumber ?? ''}</span>
                            <span className="split-marker">
                              {row.left?.type === 'del' ? '-' : ' '}
                            </span>
                            <span className="split-text">{row.left?.content ?? ''}</span>
                          </div>

                          {/* Right (New/Added) */}
                          <div
                            className={`split-col split-col--right ${
                              row.right ? `diff-line--${row.right.type}` : 'diff-line--empty'
                            }`}
                          >
                            <span className="split-num">{row.right?.newLineNumber ?? ''}</span>
                            <span className="split-marker">
                              {row.right?.type === 'add' ? '+' : ' '}
                            </span>
                            <span className="split-text">{row.right?.content ?? ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
