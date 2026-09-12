import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Home, LayoutDashboard, Play } from 'lucide-react'

interface HeaderNavProps {
  currentView: 'home' | 'cockpit'
  onSelectView: (view: 'home' | 'cockpit') => void
  onLaunchCockpit: () => void
}

export function HeaderNav({ currentView, onSelectView, onLaunchCockpit }: HeaderNavProps) {
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState<'home' | 'capabilities' | 'how-it-works' | 'agent-network' | 'faq'>('home')

  useEffect(() => {
    const sectionIds = ['capabilities', 'how-it-works', 'agent-network', 'faq']

    const handleScroll = () => {
      setScrolled(window.scrollY > 20)

      if (currentView !== 'home') return

      if (window.scrollY < 200) {
        setActiveSection('home')
        return
      }

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
            className={`header-link ${currentView === 'home' && activeSection === 'home' ? 'is-active' : ''}`}
            onClick={() => {
              onSelectView('home')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <Home className="w-3.5 h-3.5 inline mr-1" />
            Home
          </button>

          {currentView === 'home' ? (
            <>
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
                href="#faq" 
                className={`header-link ${activeSection === 'faq' ? 'is-active' : ''}`}
              >
                FAQ
              </a>
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
