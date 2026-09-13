import { useState, useEffect } from 'react'
import { GitBranch, LogOut, ExternalLink } from 'lucide-react'
import type { GitHubUser } from '../types'
import { ThemeToggle } from './ThemeToggle'

interface HeaderNavProps {
  currentView: 'home' | 'cockpit'
  onSelectView: (view: 'home' | 'cockpit') => void
  onLaunchCockpit: () => void
  user: GitHubUser | null
  onOpenAuth: () => void
  onLogout: () => void
}

export function HeaderNav({ currentView, onSelectView, user, onOpenAuth, onLogout }: HeaderNavProps) {
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState<'capabilities' | 'how-it-works' | 'agent-network' | 'infrastructure'>('capabilities')

  useEffect(() => {
    const sectionIds = ['capabilities', 'how-it-works', 'agent-network', 'infrastructure']

    const handleScroll = () => {
      setScrolled(window.scrollY > 20)

      const scrollPosition = window.scrollY + 180

      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const sectionId = sectionIds[i]
        const element = document.getElementById(sectionId)
        if (element) {
          const top = element.offsetTop
          if (scrollPosition >= top) {
            setActiveSection(sectionId as any)
            return
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [currentView])

  return (
    <header className={`header-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="header-nav-container">
        {/* Logo */}
        <button className="header-brand" onClick={() => { onSelectView('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span className="header-brand-tech-text">
            CODEGENOMEAI
          </span>
        </button>

        {/* Navigation Links */}
        <nav className="header-links">
          <a 
            href="#capabilities" 
            className={`header-link ${activeSection === 'capabilities' ? 'is-active' : ''}`}
          >
            Capabilities
          </a>
          <a 
            href="#how-it-works" 
            className={`header-link ${activeSection === 'how-it-works' ? 'is-active' : ''}`}
          >
            How It Works
          </a>
          <a 
            href="#agent-network" 
            className={`header-link ${activeSection === 'agent-network' ? 'is-active' : ''}`}
          >
            Agent Network
          </a>
          <a 
            href="#infrastructure" 
            className={`header-link ${activeSection === 'infrastructure' ? 'is-active' : ''}`}
          >
            Infrastructure
          </a>
        </nav>

        {/* Header Actions */}
        <div className="header-actions">
          {/* GitHub Repository Link */}
          <a
            href="https://github.com/raghavacse2024-dotcom/codegenome-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="header-github-repo-link"
            title="View Codebase on GitHub"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'DM Mono, monospace',
              color: 'var(--text-muted, #94a3b8)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <GitBranch className="w-3.5 h-3.5 text-neon" />
            <span className="hidden sm:inline">GitHub Repo</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>

          {/* Design Theme Selector */}
          <ThemeToggle />

          {user ? (
            <div className="header-user-profile">
              <img 
                src={user.avatar_url} 
                alt={user.login} 
                className="header-avatar" 
                referrerPolicy="no-referrer" 
              />
              <div className="header-user-info">
                <span className="header-username">{user.login}</span>
                <span className="header-auth-badge">Private Repos Active</span>
              </div>
              <button 
                type="button" 
                className="header-logout-btn" 
                onClick={onLogout}
                title="Sign out from GitHub"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button 
              type="button" 
              className="header-github-btn"
              onClick={onOpenAuth}
            >
              <GitBranch className="w-3.5 h-3.5 text-neon" />
              <span>Sign In with GitHub</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

