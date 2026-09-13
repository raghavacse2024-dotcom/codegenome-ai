import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Database, Clock, ArrowUpRight, ShieldCheck, RefreshCw, CheckCircle2 } from 'lucide-react'
import type { Analysis } from '../types'
import { getAnalysisHistory } from '../services/apiService'

interface PersistentHistoryDrawerProps {
  onSelectAnalysis: (analysis: Analysis) => void
  onSelectUrl: (url: string) => void
  currentAnalysisId?: string
}

export function PersistentHistoryDrawer({
  onSelectAnalysis,
  onSelectUrl,
  currentAnalysisId,
}: PersistentHistoryDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [historyList, setHistoryList] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const data = await getAnalysisHistory()
      if (data && Array.isArray(data.analyses)) {
        setHistoryList(data.analyses)
        setLastRefreshed(new Date())
      }
    } catch (err) {
      console.warn('[History] Could not load persisted scans:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  return (
    <div className="persistent-history-container">
      <div className="persistent-history-bar">
        <button
          type="button"
          className={`persistent-history-toggle ${isOpen ? 'is-open' : ''}`}
          onClick={() => {
            if (!isOpen) fetchHistory()
            setIsOpen(!isOpen)
          }}
          title="Toggle persistent database history"
        >
          <Database size={13} className="text-neon" />
          <span className="persistent-history-label">Cloud Firestore Scans ({historyList.length})</span>
          <span className="persistent-history-status-badge">
            <span className="pulse-dot" /> Persistent DB Active
          </span>
        </button>

        {isOpen && (
          <button
            type="button"
            className="history-refresh-btn"
            onClick={fetchHistory}
            disabled={loading}
            title="Refresh database records"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {isOpen && (
        <motion.div
          className="persistent-history-dropdown"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <div className="history-header">
            <div>
              <p className="history-title">Persistent Database Records</p>
              <p className="history-sub">
                Synced to Cloud Firestore · Saved automatically after every scan
              </p>
            </div>
            <span className="history-count">
              {historyList.length} saved {historyList.length === 1 ? 'scan' : 'scans'}
            </span>
          </div>

          {loading && historyList.length === 0 ? (
            <div className="history-loading">
              <span className="spinner" /> Loading from Firestore...
            </div>
          ) : historyList.length === 0 ? (
            <div className="history-empty">
              <p>No repository scans stored in Firestore yet.</p>
              <p className="sub">Run an analysis above to persist your first architectural scan!</p>
            </div>
          ) : (
            <div className="history-records-list">
              {historyList.map((item) => {
                const isSelected = item.analysisId === currentAnalysisId
                const repoName = `${item.repo?.owner}/${item.repo?.repository}`
                const timeAgo = item.createdAt
                  ? new Date(item.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recent'

                return (
                  <div
                    key={item.analysisId}
                    className={`history-item ${isSelected ? 'is-selected' : ''}`}
                  >
                    <div className="history-item-main">
                      <div className="history-item-top">
                        <strong className="history-repo-name">{repoName}</strong>
                        {item.isDemo && <span className="history-badge-demo">Demo</span>}
                        {isSelected && (
                          <span className="history-badge-active">
                            <CheckCircle2 size={10} /> Active View
                          </span>
                        )}
                      </div>
                      <div className="history-item-meta">
                        <span className="history-time">
                          <Clock size={10} /> {timeAgo}
                        </span>
                        {item.results?.debt?.data?.summary && (
                          <span className="history-debt-summary">
                            {item.results.debt.data.summary}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="history-item-actions">
                      <button
                        type="button"
                        className="history-view-btn"
                        onClick={() => {
                          onSelectAnalysis(item)
                          onSelectUrl(item.repo.url)
                        }}
                        title="Load full analysis from Firestore"
                      >
                        Load Report <ArrowUpRight size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
