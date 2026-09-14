import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [activeSection, setActiveSection] = useState<string | null>(null)

  useEffect(() => {
    const sectionIds = ['capabilities', 'how-it-works', 'agent-network', 'infrastructure']

    const handleScroll = () => {
      setScrolled(window.scrollY > 20)

      // When at the top of the home page, clear active section highlight
      if (window.scrollY < 200) {
        setActiveSection(null)
        return
      }

      const scrollPosition = window.scrollY + 180

      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const sectionId = sectionIds[i]
        const element = document.getElementById(sectionId)
        if (element) {
          const top = element.offsetTop
          if (scrollPosition >= top) {
            setActiveSection(sectionId)
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

        {/* Navigation Links - Fade animation and conditional display */}
        <AnimatePresence mode="wait">
          {currentView === 'home' && (
            <motion.nav 
              className="header-links"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
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
            </motion.nav>
          )}
        </AnimatePresence>

        {/* Header Actions */}
        <div className="header-actions">
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
              style={{ background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.2), rgba(125, 243, 195, 0.15))', border: '1px solid rgba(66, 133, 244, 0.4)' }}
            >
              <GitBranch className="w-3.5 h-3.5 text-neon" />
              <span>Sign In with Google</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

