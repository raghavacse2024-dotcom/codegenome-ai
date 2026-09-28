import { useState, useEffect } from 'react'
import { auth } from '../services/firebase'
import { getSessionToken, getGitHubPat } from '../services/apiService'

interface DemoModeBadgeProps {
  isDemo: boolean
  user?: { login?: string; name?: string } | null
}

/**
 * Shows when a result is using deterministic demo mode vs live model enhancement,
 * accurately reflecting the user's logged-in authentication state.
 */
export function DemoModeBadge({ isDemo, user }: DemoModeBadgeProps) {
  const [firebaseUser, setFirebaseUser] = useState(() => auth?.currentUser || null)

  useEffect(() => {
    if (!auth) return
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setFirebaseUser(u)
    })
    return () => unsubscribe()
  }, [])

  const sessionToken = getSessionToken()
  const pat = getGitHubPat()

  let resolvedUser = user
  if (!resolvedUser) {
    try {
      const cached = localStorage.getItem('codegenome_github_user')
      if (cached) {
        resolvedUser = JSON.parse(cached)
      }
    } catch {}
  }

  const isAuthenticated = Boolean(
    resolvedUser?.login ||
    sessionToken ||
    pat ||
    firebaseUser
  )

  const displayName = resolvedUser?.login || resolvedUser?.name || firebaseUser?.displayName || (firebaseUser?.email ? firebaseUser.email.split('@')[0] : '')

  return (
    <div className={`notice ${isDemo ? 'notice--demo' : 'notice--live'} reveal`}>
      <span className="notice-dot" aria-hidden="true" />
      <p>
        {isDemo ? (
          isAuthenticated ? (
            <>
              <strong>Authenticated Analysis Mode:</strong> Executing multi-agent AST telemetry & AI model enhancement for {displayName ? `@${displayName}` : 'authenticated account'}.
            </>
          ) : (
            'Public sample mode: Sign in with your Google or GitHub account to execute Live Multi-Agent Telemetry Analysis.'
          )
        ) : (
          <>
            <strong>Live Authenticated Intelligence Network:</strong> Live AST Telemetry & AI Model Enhancement{displayName ? ` (Active: @${displayName})` : ''}
          </>
        )}
      </p>
    </div>
  )
}
