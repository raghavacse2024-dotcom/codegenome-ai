import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Terminal, Play, Home, LayoutDashboard, Cpu, Sparkles } from 'lucide-react'

interface HeaderNavProps {
  currentView: 'home' | 'cockpit'
  onSelectView: (view: 'home' | 'cockpit') => void
  onLaunchCockpit: () => void
}

export function HeaderNav({ currentView, onSelectView, onLaunchCockpit }: HeaderNavProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`header-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="header-nav-container">
        {/* Logo */}
        <button className="header-brand" onClick={() => onSelectView('home')}>
          <motion.span 
            className="mark header-mark" 
            animate={{ rotate: [0, 90, 180, 270, 360] }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          >
            CG
          </motion.span>
          <span className="header-brand-text">
            <b>CODEGENOME</b>
            <span className="header-brand-tag">AI</span>
          </span>
        </button>

        {/* Navigation Links */}
        <nav className="header-links">
          <button 
            className={`header-link ${currentView === 'home' ? 'is-active' : ''}`}
            onClick={() => onSelectView('home')}
          >
            <Home className="w-3.5 h-3.5 inline mr-1" />
            Home
          </button>
          {currentView === 'home' ? (
            <>
              <a href="#capabilities" className="header-link">Capabilities</a>
              <a href="#how-it-works" className="header-link">How It Works</a>
              <a href="#agent-network" className="header-link">Agent Network</a>
              <a href="#faq" className="header-link">FAQ</a>
            </>
          ) : null}
          <button 
            className={`header-link ${currentView === 'cockpit' ? 'is-active' : ''}`}
            onClick={() => onSelectView('cockpit')}
          >
            <LayoutDashboard className="w-3.5 h-3.5 inline mr-1" />
            Refactor Cockpit
          </button>
        </nav>

        {/* Header Actions */}
        <div className="header-actions">
          <div className="header-status-badge">
            <span className="status-dot text-neon" />
            <span>5 Agents Ready</span>
          </div>
          <button 
            className="run-button header-cta-btn"
            onClick={onLaunchCockpit}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Cockpit</span>
          </button>
        </div>
      </div>
    </header>
  )
}
