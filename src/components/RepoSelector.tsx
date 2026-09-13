import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Unlock, Search, RefreshCw, Star, ArrowRight, FolderGit2, AlertCircle } from 'lucide-react'
import type { UserRepo } from '../types'
import { getUserRepositories } from '../services/apiService'

interface RepoSelectorProps {
  onSelectRepo: (url: string) => void
  currentUrl: string
}

export function RepoSelector({ onSelectRepo, currentUrl }: RepoSelectorProps) {
  const [repos, setRepos] = useState<UserRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'private' | 'public'>('all')
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRepos = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getUserRepositories()
      setRepos(data.repositories || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRepos()
  }, [])

  const filtered = repos.filter((r) => {
    if (filter === 'private' && !r.private) return false
    if (filter === 'public' && r.private) return false
    if (!search.trim()) return true
    const term = search.toLowerCase()
    return r.fullName.toLowerCase().includes(term) || (r.description && r.description.toLowerCase().includes(term))
  })

  return (
    <div className="repo-selector-container">
      <div className="repo-selector-toggle-bar">
        <button 
          type="button"
          className="repo-selector-toggle-btn"
          onClick={() => setIsOpen(!isOpen)}
        >
          <FolderGit2 className="w-3.5 h-3.5 text-[#7df3c3]" />
          <span>{isOpen ? 'Hide My Repositories' : 'Select From Your GitHub Repositories (Private & Public)'}</span>
          <span className="repo-count-pill">{repos.length}</span>
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="repo-selector-dropdown"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="repo-selector-header">
              <div className="repo-search-box">
                <Search className="w-3.5 h-3.5 text-[#8cafd2]" />
                <input 
                  type="text" 
                  className="repo-search-input"
                  placeholder="Filter repositories by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="repo-filter-chips">
                <button 
                  type="button" 
                  className={`repo-chip ${filter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All ({repos.length})
                </button>
                <button 
                  type="button" 
                  className={`repo-chip ${filter === 'private' ? 'is-active' : ''}`}
                  onClick={() => setFilter('private')}
                >
                  <Lock className="w-2.5 h-2.5 inline mr-1" />
                  Private ({repos.filter(r => r.private).length})
                </button>
                <button 
                  type="button" 
                  className={`repo-chip ${filter === 'public' ? 'is-active' : ''}`}
                  onClick={() => setFilter('public')}
                >
                  <Unlock className="w-2.5 h-2.5 inline mr-1" />
                  Public ({repos.filter(r => !r.private).length})
                </button>
                <button 
                  type="button" 
                  className="repo-refresh-btn"
                  onClick={fetchRepos}
                  title="Refresh repository list"
                  disabled={loading}
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {error && (
              <div className="repo-selector-error">
                <AlertCircle className="w-3.5 h-3.5 text-[#ff6b6b]" />
                <span>{error}</span>
              </div>
            )}

            <div className="repo-list-scroll">
              {loading && repos.length === 0 ? (
                <div className="repo-list-empty">Loading repositories from GitHub...</div>
              ) : filtered.length === 0 ? (
                <div className="repo-list-empty">No repositories matching your criteria.</div>
              ) : (
                filtered.map((r) => {
                  const isCurrent = currentUrl.trim().toLowerCase() === r.url.toLowerCase()
                  return (
                    <div 
                      key={r.fullName} 
                      className={`repo-item ${isCurrent ? 'is-selected' : ''}`}
                      onClick={() => {
                        onSelectRepo(r.url)
                        setIsOpen(false)
                      }}
                    >
                      <div className="repo-item-meta">
                        <div className="repo-item-title-row">
                          <span className="repo-item-name">{r.fullName}</span>
                          {r.private ? (
                            <span className="repo-privacy-tag is-private">
                              <Lock className="w-2.5 h-2.5" /> Private
                            </span>
                          ) : (
                            <span className="repo-privacy-tag is-public">Public</span>
                          )}
                          {r.language && <span className="repo-lang-tag">{r.language}</span>}
                        </div>
                        {r.description && <p className="repo-item-desc">{r.description}</p>}
                      </div>
                      <button 
                        type="button" 
                        className="repo-pick-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectRepo(r.url)
                          setIsOpen(false)
                        }}
                      >
                        {isCurrent ? 'Selected' : 'Analyze'}
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
