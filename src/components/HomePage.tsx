import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Terminal, 
  Cpu, 
  GitBranch, 
  ShieldCheck, 
  Zap, 
  Code2, 
  Layers, 
  DollarSign, 
  Flame, 
  Download, 
  CheckCircle2, 
  ArrowRight, 
  ChevronRight, 
  Sparkles, 
  HelpCircle, 
  Activity, 
  FileCode, 
  Play,
  Share2,
  Check,
  Search
} from 'lucide-react'

interface HomePageProps {
  onLaunchCockpit: (repoUrl?: string) => void
}

export function HomePage({ onLaunchCockpit }: HomePageProps) {
  const [inputUrl, setInputUrl] = useState('https://github.com/vercel/turbo')
  const [activeFaq, setActiveFaq] = useState<number | null>(0)
  const [activeStep, setActiveStep] = useState(0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onLaunchCockpit(inputUrl)
  }

  // Motion animation variants
  const fadeInUp = {
    hidden: { opacity: 0, y: 35 },
    visible: (custom = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: custom * 0.1 }
    })
  }

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 }
    }
  }

  const cardHover = {
    hover: { 
      y: -8, 
      scale: 1.02, 
      boxShadow: '0 24px 48px -12px rgba(125, 243, 195, 0.25)',
      transition: { duration: 0.3, ease: 'easeOut' }
    }
  }

  const features = [
    {
      icon: <Layers className="w-6 h-6 text-neon" />,
      title: "Architecture Genome Mapping",
      description: "Automatically extracts system layers, module dependency trees, and cyclical graph bindings across your entire codebase.",
      badge: "Structural Insight"
    },
    {
      icon: <DollarSign className="w-6 h-6 text-cyan" />,
      title: "Financial Technical Debt Index",
      description: "Calculates estimated refactor cost in developer hours and financial currency, prioritizing high-risk architectural debt.",
      badge: "Debt Valuation"
    },
    {
      icon: <Flame className="w-6 h-6 text-amber-400" />,
      title: "Hotspot & Fragility Telemetry",
      description: "Identifies complex modules with high cyclomatic complexity, frequent churn, and elevated bug propagation risk.",
      badge: "Risk Prevention"
    },
    {
      icon: <Code2 className="w-6 h-6 text-violet" />,
      title: "Automated Refactor Blueprint",
      description: "Compiles complete, drop-in replacement code scaffolds with TypeScript types, docstrings, and performance optimizations.",
      badge: "Code Generation"
    },
    {
      icon: <Cpu className="w-6 h-6 text-neon" />,
      title: "5-Agent Cooperative Mesh",
      description: "Specialized AI agents work concurrently in an automated pipeline: Architecture, Tech Debt, Risk, Planner, & Reviewer.",
      badge: "Multi-Agent AI"
    },
    {
      icon: <Terminal className="w-6 h-6 text-cyan" />,
      title: "Contextual Codebase Q&A",
      description: "Ask natural language questions about architecture, design patterns, or refactor strategies grounded in code analysis.",
      badge: "Live Telemetry"
    }
  ]

  const workflowSteps = [
    {
      step: "01",
      title: "Target Repository",
      subtitle: "Zero Configuration",
      desc: "Provide any public GitHub repository link. No local setup, tokens, or repository mutation required.",
      icon: <GitBranch className="w-5 h-5 text-neon" />
    },
    {
      step: "02",
      title: "Multi-Agent Scan",
      subtitle: "Parallel Execution",
      desc: "Five specialized AI agents run deep static analysis, AST extraction, and complexity scoring concurrently.",
      icon: <Cpu className="w-5 h-5 text-cyan" />
    },
    {
      step: "03",
      title: "Genome Synthesis",
      subtitle: "Telemetry Report",
      desc: "Receive actionable telemetry: risk hotspot maps, language distribution, and financial debt pricing.",
      icon: <Activity className="w-5 h-5 text-violet" />
    },
    {
      step: "04",
      title: "Download Refactor ZIP",
      subtitle: "Instant Deployment",
      desc: "Inspect side-by-side refactored code blocks and download complete scaffold ZIP bundles with 1 click.",
      icon: <Download className="w-5 h-5 text-neon" />
    }
  ]

  const agentNetwork = [
    {
      name: "Architecture Agent",
      role: "Graph & Layer Analysis",
      desc: "Maps system boundaries, entrypoints, layer hierarchy, and package interdependencies.",
      color: "var(--neon)"
    },
    {
      name: "Technical Debt Agent",
      role: "Financial Debt Indexing",
      desc: "Estimates developer hours, complexity load, and refactor cost impact.",
      color: "var(--cyan)"
    },
    {
      name: "Risk & Cost Agent",
      role: "Hotspot & Fragility Audit",
      desc: "Scans for cyclical dependencies, high churn paths, and fragile modules.",
      color: "var(--warn)"
    },
    {
      name: "Refactor Planner",
      role: "Code Scaffold Generation",
      desc: "Generates clean modular code snippets, updated typings, and architectural blueprints.",
      color: "var(--violet)"
    },
    {
      name: "Review Agent",
      role: "Quality & Safety Telemetry",
      desc: "Validates AST compliance, zero breaking changes, and read-only protocol verification.",
      color: "var(--neon)"
    }
  ]

  const faqs = [
    {
      q: "What is CodeGenome AI?",
      a: "CodeGenome AI is an autonomous codebase intelligence platform powered by a multi-agent AI network. It scans repository source code, maps system architecture, prices technical debt, and generates automated refactoring blueprints."
    },
    {
      q: "Does CodeGenome AI write changes to my repository?",
      a: "No! CodeGenome AI operates strictly on a read-only scan protocol. It analyzes repository code and presents refactoring recommendations, code snippets, and downloadable ZIP scaffolds without modifying your original repository."
    },
    {
      q: "How are the technical debt cost estimates calculated?",
      a: "Our Technical Debt Agent analyzes cyclomatic complexity, code duplication, file coupling, and structural anti-patterns. It translates these metrics into estimated engineering effort hours and approximate financial cost based on standard industry developer rates."
    },
    {
      q: "Which repositories and languages are supported?",
      a: "CodeGenome AI supports any public GitHub repository across popular modern languages including TypeScript, JavaScript, Python, Go, Rust, Java, C++, Python, PHP, Ruby, and HTML/CSS."
    },
    {
      q: "Can I download refactored code files?",
      a: "Yes! Once analysis is complete, you can review side-by-side refactored code and download a complete ZIP package containing the generated code blueprints and refactor instructions."
    }
  ]

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="home-hero-section">
        <motion.div 
          className="home-hero-content"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {/* Eyebrow Pill */}
          <motion.div variants={fadeInUp} custom={0} className="home-hero-pill">
            <Sparkles className="w-3.5 h-3.5 text-neon" />
            <span>Autonomous Multi-Agent Repository Intelligence</span>
            <span className="home-hero-pill-badge">v2.0 Online</span>
          </motion.div>

          {/* Headline */}
          <motion.h1 variants={fadeInUp} custom={1} className="home-hero-title">
            Deconstruct Codebases. <br />
            <span className="home-hero-gradient-text">Eliminate Technical Debt</span> with CodeGenome AI.
          </motion.h1>

          {/* Subtitle */}
          <motion.p variants={fadeInUp} custom={2} className="home-hero-subtitle">
            Deploy a cooperative network of 5 specialized AI agents to map repository architecture, 
            price technical debt in developer hours, pinpoint fragility hotspots, and compile automated refactor scaffolds.
          </motion.p>

          {/* Hero Form / Quick Launch */}
          <motion.form 
            variants={fadeInUp} 
            custom={3} 
            onSubmit={handleSubmit}
            className="home-hero-form"
          >
            <div className="home-hero-input-wrapper">
              <GitBranch className="home-hero-input-icon" />
              <input 
                type="url" 
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://github.com/owner/repository"
                required
                className="home-hero-input"
              />
              <button type="submit" className="home-hero-submit-btn">
                <Play className="w-4 h-4 fill-current" />
                <span>Launch Analysis</span>
              </button>
            </div>
            <div className="home-hero-quick-links">
              <span className="text-muted text-xs">Try demo:</span>
              <button 
                type="button" 
                className="home-chip" 
                onClick={() => { setInputUrl('https://github.com/vercel/turbo'); onLaunchCockpit('https://github.com/vercel/turbo'); }}
              >
                vercel/turbo
              </button>
              <button 
                type="button" 
                className="home-chip" 
                onClick={() => { setInputUrl('https://github.com/facebook/react'); onLaunchCockpit('https://github.com/facebook/react'); }}
              >
                facebook/react
              </button>
              <button 
                type="button" 
                className="home-chip" 
                onClick={() => { setInputUrl('https://github.com/tailwindlabs/tailwindcss'); onLaunchCockpit('https://github.com/tailwindlabs/tailwindcss'); }}
              >
                tailwindlabs/tailwindcss
              </button>
            </div>
          </motion.form>

          {/* Stats Bar */}
          <motion.div variants={fadeInUp} custom={4} className="home-hero-stats">
            <div className="home-stat-item">
              <span className="home-stat-num">5 AI Agents</span>
              <span className="home-stat-label">Cooperative Mesh</span>
            </div>
            <div className="home-stat-divider" />
            <div className="home-stat-item">
              <span className="home-stat-num">&lt; 60 Seconds</span>
              <span className="home-stat-label">Full Scan Execution</span>
            </div>
            <div className="home-stat-divider" />
            <div className="home-stat-item">
              <span className="home-stat-num">100% Read-Only</span>
              <span className="home-stat-label">Zero Code Mutations</span>
            </div>
            <div className="home-stat-divider" />
            <div className="home-stat-item">
              <span className="home-stat-num">ZIP Scaffolds</span>
              <span className="home-stat-label">Instant Code Export</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Hero Interactive Terminal Mockup Visual */}
        <motion.div 
          className="home-hero-visual"
          initial={{ opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="home-visual-card">
            <div className="home-visual-header">
              <div className="home-visual-dots">
                <span className="dot dot-red" />
                <span className="dot dot-yellow" />
                <span className="dot dot-green" />
              </div>
              <div className="home-visual-title">
                <Terminal className="w-3.5 h-3.5 text-neon" />
                <span>codegenome-agent-network.telemetry</span>
              </div>
              <span className="home-visual-status">🟢 ONLINE</span>
            </div>

            <div className="home-visual-body">
              <div className="home-visual-stream">
                <p className="code-line text-muted">$ codegenome scan https://github.com/vercel/turbo</p>
                <p className="code-line text-neon">[0.0s] Initializing 5 execution agents...</p>
                <p className="code-line text-cyan">[1.2s] ArchitectureAgent: Mapped 4 modules, 18 dependency nodes</p>
                <p className="code-line text-amber-300">[2.5s] TechnicalDebtAgent: Calculated debt index (Score 78/100 - $14,200)</p>
                <p className="code-line text-violet">[3.8s] RiskAgent: Flagged 2 fragile hotspots in parser/core.ts</p>
                <p className="code-line text-emerald-400">[5.1s] RefactorPlanner: Scaffolded TypeScript interface cleanups</p>
                <div className="code-typing-row">
                  <span className="text-neon">&gt; Telemetry ready. ZIP package compiled.</span>
                  <span className="home-cursor-pulse" />
                </div>
              </div>

              {/* Floating Floating Badges */}
              <motion.div 
                className="home-floating-badge badge-1"
                animate={{ y: [-4, 6, -4] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Layers className="w-4 h-4 text-neon" />
                <div>
                  <strong>Module Map</strong>
                  <small>Clean Layer Boundaries</small>
                </div>
              </motion.div>

              <motion.div 
                className="home-floating-badge badge-2"
                animate={{ y: [6, -6, 6] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              >
                <DollarSign className="w-4 h-4 text-cyan" />
                <div>
                  <strong>Debt Index: B+</strong>
                  <small>$14,200 Estimated Cleanup</small>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Section 1: What CodeGenome AI Is (Core Capabilities Grid) */}
      <section className="home-section" id="capabilities">
        <motion.div 
          className="home-section-header"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <span className="eyebrow">
            <Zap className="w-3.5 h-3.5 inline mr-1" />
            CORE CAPABILITIES
          </span>
          <h2>What CodeGenome AI Does</h2>
          <p className="home-section-desc">
            A comprehensive suite of autonomous code intelligence and structural telemetry tools 
            engineered to make complex codebases readable, maintainable, and refactor-ready.
          </p>
        </motion.div>

        <motion.div 
          className="home-grid-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
        >
          {features.map((feat, idx) => (
            <motion.div 
              key={idx}
              className="home-card"
              variants={fadeInUp}
              whileHover="hover"
              custom={idx}
            >
              <div className="home-card-header">
                <div className="home-card-icon-box">
                  {feat.icon}
                </div>
                <span className="home-card-badge">{feat.badge}</span>
              </div>
              <h3>{feat.title}</h3>
              <p>{feat.description}</p>
              <div className="home-card-foot">
                <span>Explore Telemetry</span>
                <ChevronRight className="w-4 h-4 text-neon" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Section 2: How It Works (4-Step Animated Pipeline) */}
      <section className="home-section" id="how-it-works">
        <motion.div 
          className="home-section-header"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <span className="eyebrow">
            <Activity className="w-3.5 h-3.5 inline mr-1" />
            WORKFLOW PIPELINE
          </span>
          <h2>How CodeGenome AI Works</h2>
          <p className="home-section-desc">
            Four simple steps from repository URL to deep structural insight and automated refactor code packages.
          </p>
        </motion.div>

        <motion.div 
          className="home-pipeline-container"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
        >
          {workflowSteps.map((step, idx) => (
            <motion.div 
              key={idx}
              className={`home-pipeline-step ${activeStep === idx ? 'is-active' : ''}`}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              onMouseEnter={() => setActiveStep(idx)}
              custom={idx}
            >
              <div className="home-step-num-col">
                <span className="home-step-number">{step.step}</span>
                {idx < workflowSteps.length - 1 && <div className="home-step-line" />}
              </div>
              <div className="home-step-content-card">
                <div className="home-step-icon-bar">
                  {step.icon}
                  <span className="home-step-subtitle">{step.subtitle}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Section 3: Meet the 5-Agent Network */}
      <section className="home-section" id="agent-network">
        <motion.div 
          className="home-section-header"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <span className="eyebrow">
            <Cpu className="w-3.5 h-3.5 inline mr-1" />
            MULTI-AGENT ENGINE
          </span>
          <h2>The 5 Specialized AI Agents</h2>
          <p className="home-section-desc">
            Each agent operates with specialized domain expertise, sharing telemetry across a unified execution mesh.
          </p>
        </motion.div>

        <motion.div 
          className="home-agent-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
        >
          {agentNetwork.map((agent, idx) => (
            <motion.div 
              key={idx}
              className="home-agent-card"
              variants={fadeInUp}
              whileHover={{ scale: 1.03, translateY: -6 }}
              custom={idx}
            >
              <div className="home-agent-card-top">
                <span className="home-agent-badge" style={{ borderColor: agent.color, color: agent.color }}>
                  Node 0{idx + 1}
                </span>
                <span className="home-agent-status">ONLINE</span>
              </div>
              <h4>{agent.name}</h4>
              <span className="home-agent-role">{agent.role}</span>
              <p>{agent.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Section 4: Interactive Live Demo Preview */}
      <section className="home-section" id="live-demo">
        <div className="home-demo-card">
          <motion.div 
            className="home-demo-left"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <span className="eyebrow"><Terminal className="w-3.5 h-3.5 inline mr-1" /> TELEMETRY PREVIEW</span>
            <h2>See What CodeGenome AI Discovers</h2>
            <p>
              When you launch an analysis, CodeGenome AI generates instant actionable telemetry scorecards, 
              risk hotspot maps, language distribution breakdowns, and automated refactor blueprints.
            </p>
            <ul className="home-demo-checklist">
              <li><CheckCircle2 className="w-4 h-4 text-neon" /> Architecture layer compliance & cycle detection</li>
              <li><CheckCircle2 className="w-4 h-4 text-neon" /> Financial debt score & refactor effort hour estimates</li>
              <li><CheckCircle2 className="w-4 h-4 text-neon" /> File fragility hotspot score ranking</li>
              <li><CheckCircle2 className="w-4 h-4 text-neon" /> One-click download of generated refactored code ZIP</li>
            </ul>
            <button className="run-button mt-4" onClick={() => onLaunchCockpit('https://github.com/vercel/turbo')}>
              <Play className="w-4 h-4" /> Try Live Demo Now
            </button>
          </motion.div>

          <motion.div 
            className="home-demo-right"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <div className="home-telemetry-preview-box">
              <div className="preview-score-row">
                <div className="preview-score-pill">
                  <span>HEALTH SCORE</span>
                  <strong>84<small>/100</small></strong>
                </div>
                <div className="preview-score-pill">
                  <span>DEBT ESTIMATE</span>
                  <strong className="text-neon">$12,400</strong>
                </div>
                <div className="preview-score-pill">
                  <span>REFACTOR TIME</span>
                  <strong>62 <small>hrs</small></strong>
                </div>
              </div>

              <div className="preview-hotspot-sample">
                <span className="eyebrow text-xs">TOP RISK HOTSPOT</span>
                <div className="hotspot-sample-card">
                  <div className="hotspot-sample-title">
                    <FileCode className="w-4 h-4 text-amber-400" />
                    <strong>src/core/compiler.ts</strong>
                  </div>
                  <div className="hotspot-sample-bar">
                    <div className="hotspot-sample-fill" style={{ width: '82%' }} />
                  </div>
                  <div className="hotspot-sample-meta">
                    <span>Complexity: 42</span>
                    <span className="text-warn">High Churn</span>
                  </div>
                </div>
              </div>

              <div className="preview-snippet-box">
                <span className="eyebrow text-xs">GENERATED REFACTOR SCAFFOLD</span>
                <pre className="preview-code">
                  <code>{`// Refactored by CodeGenome Refactor Planner
export interface CompilerConfig {
  readonly target: string;
  readonly strictMode: boolean;
}

export function compileAST(node: ASTNode): Result {
  // Decoupled parsing logic with zero cycle dependency
  return parseNode(node);
}`}</code>
                </pre>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 5: FAQs */}
      <section className="home-section" id="faq">
        <motion.div 
          className="home-section-header"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <span className="eyebrow">
            <HelpCircle className="w-3.5 h-3.5 inline mr-1" />
            FREQUENTLY ASKED QUESTIONS
          </span>
          <h2>Everything You Need to Know</h2>
        </motion.div>

        <div className="home-faq-list">
          {faqs.map((faq, idx) => (
            <motion.div 
              key={idx}
              className={`home-faq-item ${activeFaq === idx ? 'is-open' : ''}`}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
              custom={idx}
            >
              <button 
                className="home-faq-question"
                onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
              >
                <span>{faq.q}</span>
                <ChevronRight className={`w-4 h-4 transform transition-transform ${activeFaq === idx ? 'rotate-90 text-neon' : 'text-muted'}`} />
              </button>
              <AnimatePresence>
                {activeFaq === idx && (
                  <motion.div 
                    className="home-faq-answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <p>{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Section 6: Bottom Call to Action Banner */}
      <section className="home-cta-section">
        <motion.div 
          className="home-cta-box"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
        >
          <div className="home-cta-content">
            <h2>Ready to Map & Refactor Your Codebase?</h2>
            <p>Deploy the 5-agent network onto any public GitHub repository right now. 100% free, read-only scan protocol.</p>
            <div className="home-cta-buttons">
              <button className="run-button" onClick={() => onLaunchCockpit()}>
                <Play className="w-4 h-4" /> Launch Refactor Cockpit
              </button>
              <button className="chip chip--accent" onClick={() => onLaunchCockpit('https://github.com/vercel/turbo')}>
                Load Turbo Repo Demo
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-brand">
            <div className="rail-brand">
              <span className="mark">CG</span>
              <span className="rail-name">
                <b>CODEGENOME AI</b>
                <small>Multi-Agent Telemetry Engine</small>
              </span>
            </div>
            <p className="text-xs text-muted mt-2">
              Autonomous multi-agent repository intelligence and refactor telemetry. Read-only scan protocol.
            </p>
          </div>
          <div className="home-footer-status">
            <span className="status-dot text-neon" />
            <span className="text-xs font-mono text-muted">All 5 AI Agents Operational</span>
          </div>
        </div>
        <div className="home-footer-bottom">
          <p>© {new Date().getFullYear()} CodeGenome AI. Built for high-performance software engineering teams.</p>
        </div>
      </footer>
    </div>
  )
}
