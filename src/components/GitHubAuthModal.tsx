import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Lock, Unlock, LogOut, ExternalLink, Key, CheckCircle, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react'
import type { GitHubUser, UserRepo } from '../types'
import { getGitHubAuthUrl, getCurrentUser, authenticateWithToken, logoutUser, getUserRepositories, setSessionToken } from '../services/apiService'

interface GitHubAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: GitHubUser) => void
  initialMode?: 'oauth' | 'pat'
}

export function GitHubAuthModal({ isOpen, onClose, onSuccess, initialMode = 'oauth' }: GitHubAuthModalProps) {
  const [tab, setTab] = useState<'oauth' | 'pat'>(initialMode)
  const [patInput, setPatInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authConfig, setAuthConfig] = useState<{ configured: boolean; url: string | null; callbackUrl: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setError(null)
      getGitHubAuthUrl().then(setAuthConfig).catch(() => {})
    }
  }, [isOpen])

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin if available
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { sessionId, user } = event.data
        if (sessionId) {
          setSessionToken(sessionId)
        }
        onSuccess(user)
        onClose()
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setError(event.data.error || 'GitHub authorization failed.')
        setLoading(false)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onSuccess, onClose])

  const handleOAuthLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getGitHubAuthUrl()
      if (!data.configured || !data.url) {
        setError('GitHub OAuth App is not configured on the server yet. You can sign in instantly using a Personal Access Token below!')
        setTab('pat')
        setLoading(false)
        return
      }

      // Open OAuth popup directly pointing to GitHub authorize URL
      const popup = window.open(
        data.url,
        'github_oauth_popup',
        'width=600,height=720,menubar=no,toolbar=no,status=no'
      )

      if (!popup) {
        setError('Popup blocked by browser. Please enable popups or use Personal Access Token.')
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate GitHub login.')
      setLoading(false)
    }
  }

  const handlePatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!patInput.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await authenticateWithToken(patInput.trim())
      setSessionToken(res.sessionId)
      onSuccess(res.user)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid token or unable to verify with GitHub.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <motion.div 
        className="auth-modal-card" 
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
      >
        <div className="auth-modal-header">
          <div className="auth-modal-title">
            <GitBranch className="w-5 h-5 text-[#7df3c3]" />
            <h3>GitHub Authentication</h3>
          </div>
          <button className="auth-modal-close" onClick={onClose}>&times;</button>
        </div>

        <p className="auth-modal-desc">
          Sign in to analyze your <strong>private repositories</strong>, increase GitHub rate limits (5,000 req/hr), and access organization codebases.
        </p>

        {/* Tab switch */}
        <div className="auth-tabs">
          <button 
            type="button"
            className={`auth-tab ${tab === 'oauth' ? 'is-active' : ''}`}
            onClick={() => { setTab('oauth'); setError(null); }}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Sign in with GitHub
          </button>
          <button 
            type="button"
            className={`auth-tab ${tab === 'pat' ? 'is-active' : ''}`}
            onClick={() => { setTab('pat'); setError(null); }}
          >
            <Key className="w-3.5 h-3.5" />
            Personal Access Token
          </button>
        </div>

        {error && (
          <div className="auth-error-banner">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#ff6b6b]" />
            <span>{error}</span>
          </div>
        )}

        {tab === 'oauth' ? (
          <div className="auth-tab-content">
            <div className="auth-oauth-box">
              <p className="auth-oauth-text">
                Authenticate seamlessly with GitHub OAuth. You will be prompted to grant read permissions to your repositories.
              </p>

              <button 
                className="run-button auth-primary-btn" 
                onClick={handleOAuthLogin}
                disabled={loading}
              >
                <GitBranch className="w-4 h-4 text-neon" />
                <span>{loading ? 'Opening GitHub Authorization...' : 'Sign in via GitHub'}</span>
              </button>

              {authConfig && !authConfig.configured && (
                <div className="auth-note-box">
                  <strong>Developer Note:</strong>
                  <p>
                    To enable 1-click OAuth, add <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> in the project settings.
                    <br />
                    Callback URL: <code>{authConfig.callbackUrl}</code>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form className="auth-tab-content" onSubmit={handlePatSubmit}>
            <div className="auth-pat-box">
              <label className="auth-label">
                GitHub Personal Access Token (Classic or Fine-grained)
              </label>
              <input 
                type="password" 
                className="qa-input auth-pat-input" 
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                disabled={loading}
              />
              <p className="auth-hint">
                Requires <code>repo</code> scope for private repositories or <code>read:user</code> for public.
                Tokens stay in your browser session and are never saved to disk.
              </p>

              <button 
                type="submit" 
                className="run-button auth-primary-btn"
                disabled={loading || !patInput.trim()}
              >
                <Key className="w-4 h-4" />
                <span>{loading ? 'Validating Token...' : 'Connect with Token'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="auth-modal-footer">
          <div className="auth-privacy-badge">
            <Lock className="w-3 h-3 text-[#7df3c3]" />
            <span>Zero repository code is stored on our servers. Read-only in memory.</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
