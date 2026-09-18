import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Lock, AlertCircle, Key, CheckCircle2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import type { GitHubUser } from '../types'
import { getGitHubAuthUrl, setSessionToken, setGitHubPat, registerSession, authenticateWithToken, getGitHubPat } from '../services/apiService'

interface GitHubAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: GitHubUser) => void
}

export function GitHubAuthModal({ isOpen, onClose, onSuccess }: GitHubAuthModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patInput, setPatInput] = useState(getGitHubPat() || '')
  const [showTokenInput, setShowTokenInput] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setError(null)
    }
  }, [isOpen])

  const handlePatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = patInput.trim()
    if (!clean) {
      setError('Please paste your GitHub Personal Access Token.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await authenticateWithToken(clean)
      if (res && res.user) {
        setSessionToken(res.sessionId)
        setGitHubPat(clean)
        registerSession(res.sessionId, res.user, clean)
        try {
          localStorage.setItem('codegenome_github_user', JSON.stringify(res.user))
        } catch {}
        onSuccess(res.user)
        onClose()
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid GitHub token. Please verify permissions.')
    } finally {
      setLoading(false)
    }
  }

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { sessionId, user, token } = event.data
        if (token) {
          setGitHubPat(token)
        }
        if (sessionId) {
          setSessionToken(sessionId)
          registerSession(sessionId, user, token)
        }
        if (user) {
          try {
            localStorage.setItem('codegenome_github_user', JSON.stringify(user))
          } catch {}
          onSuccess(user)
        }
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
      const data = await getGitHubAuthUrl().catch(() => null)
      if (data && data.configured && data.url) {
        const popup = window.open(
          data.url,
          'github_oauth_popup',
          'width=600,height=750,menubar=no,toolbar=no,status=no'
        )
        if (!popup) {
          setError('Popup was blocked by your browser. Please allow popups to authorize with GitHub.')
          setLoading(false)
        } else {
          const timer = setInterval(() => {
            if (popup.closed) {
              clearInterval(timer)
              setLoading(false)
            }
          }, 500)
        }
        return
      }

      setError('GitHub OAuth configuration is missing on server. You can connect using a Personal Access Token below.')
      setShowTokenInput(true)
      setLoading(false)
    } catch (err: any) {
      setError(err?.message || 'Authentication error. Please try again.')
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
        style={{ maxWidth: '480px' }}
      >
        <div className="auth-modal-header">
          <div className="auth-modal-title">
            <GitBranch className="w-5 h-5 text-[#39f3c3]" />
            <h3>GitHub Account & Write Authorization</h3>
          </div>
          <button className="auth-modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && (
          <div className="auth-error-banner" style={{ marginTop: '12px' }}>
            <AlertCircle className="w-4 h-4 shrink-0 text-[#ff6b6b]" />
            <span>{error}</span>
          </div>
        )}

        <div style={{ padding: '16px 0 10px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Primary GitHub Sign In with Write Permissions */}
          <button 
            type="button"
            className="run-button auth-primary-btn" 
            onClick={handleOAuthLogin}
            disabled={loading}
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              padding: '14px 20px', 
              fontSize: '15px', 
              fontWeight: '600', 
              background: '#24292e', 
              borderColor: '#39f3c3',
              color: '#ffffff',
              boxShadow: '0 4px 16px rgba(57, 243, 195, 0.15)',
              display: 'flex',
              alignItems: 'center',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <GitBranch className="w-5 h-5 mr-2 text-[#39f3c3]" />
            <span>
              {loading ? 'Opening GitHub Authorization...' : 'Sign in with GitHub (Write & PR Access)'}
            </span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Toggle for Token */}
          <div>
            <button
              type="button"
              onClick={() => setShowTokenInput(!showTokenInput)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: showTokenInput ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: '#94a3b8',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={14} className="text-[#39f3c3]" />
                <span>Connect via GitHub Personal Access Token (PAT)</span>
              </span>
              {showTokenInput ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showTokenInput && (
              <form onSubmit={handlePatSubmit} style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ position: 'relative' }}>
                  <Key size={14} style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }} />
                  <input
                    type="password"
                    placeholder="Paste token (ghp_... or github_pat_...)"
                    value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px 10px 36px',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=CodeGenome+AI+PR+Access"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#39f3c3',
                      textDecoration: 'underline'
                    }}
                  >
                    Generate token with repo scope pre-ticked on GitHub <ExternalLink size={11} />
                  </a>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>{loading ? 'Validating Token...' : 'Authorize with Token'}</span>
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="auth-modal-footer">
          <div className="auth-privacy-badge">
            <Lock className="w-3 h-3 text-[#7df3c3]" />
            <span>Session is permanently persistent. Real-time live analysis enabled.</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

