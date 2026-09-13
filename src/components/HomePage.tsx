import { useState, useEffect } from 'react'
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
  ChevronRight, 
  Activity, 
  FileCode, 
  Play,
  Plus,
  ArrowRight,
  Sparkles,
  Lock,
  GitPullRequest
} from 'lucide-react'

const EXAMPLE_REPOS = [
  'https://github.com/raghavacse2024-dotcom/codegenome-ai',
  'https://github.com/facebook/react',
  'https://github.com/expressjs/express',
  'https://github.com/vercel/next.js',
  'https://github.com/tailwindlabs/tailwindcss',
  'https://github.com/astral-sh/uv'
]

interface HomePageProps {
  onLaunchCockpit: (repoUrl?: string) => void
}

export function HomePage({ onLaunchCockpit }: HomePageProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [ctaInput, setCtaInput] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Smooth typewriter effect for running example GitHub links
  useEffect(() => {
    const currentFullText = EXAMPLE_REPOS[placeholderIndex]
    let timer: NodeJS.Timeout

    if (!isDeleting) {
      if (displayedPlaceholder.length < currentFullText.length) {
        timer = setTimeout(() => {
          setDisplayedPlaceholder(currentFullText.slice(0, displayedPlaceholder.length + 1))
        }, 40)
      } else {
        // Pause before deleting
        timer = setTimeout(() => {
          setIsDeleting(true)
        }, 2200)
      }
    } else {
      if (displayedPlaceholder.length > 0) {
        timer = setTimeout(() => {
          setDisplayedPlaceholder(currentFullText.slice(0, displayedPlaceholder.length - 1))
        }, 20)
      } else {
        setIsDeleting(false)
        setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_REPOS.length)
      }
    }

    return () => clearTimeout(timer)
  }, [displayedPlaceholder, isDeleting, placeholderIndex])

  const handleCtaSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const targetUrl = ctaInput.trim() || EXAMPLE_REPOS[placeholderIndex]
    onLaunchCockpit(targetUrl)
  }

  // Motion animation variants - streamlined for 60fps GPU smoothness
  const fadeInUp = {
    hidden: { opacity: 0, y: 14 },
    visible: (custom = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const, delay: custom * 0.04 }
    })
  }

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.02 }
    }
  }

  const features = [
    {
      icon: <Layers className="w-6 h-6 text-neon" />,
      title: "Architecture Genome Mapping",
      badge: "Structural Insight",
      frontDesc: "Extracts system layers, module dependency trees, and cyclical graph bindings across your codebase.",
      backTitle: "Genome & Layer Telemetry",
      backDesc: "Analyzes AST call graphs to discover circular imports, orphaned modules, and layer boundary violations.",
      stats: "100% Dependency Graph Coverage"
    },
    {
      icon: <DollarSign className="w-6 h-6 text-cyan" />,
      title: "Financial Technical Debt Index",
      badge: "Debt Valuation",
      frontDesc: "Calculates refactor cost in developer hours and financial currency, prioritizing high-risk debt.",
      backTitle: "Financial Risk Engine",
      backDesc: "Translates code complexity, duplication, and anti-patterns into monetary cleanup costs and effort estimates.",
      stats: "Precise Dollar & Hour Metrics"
    },
    {
      icon: <Flame className="w-6 h-6 text-amber-400" />,
      title: "Hotspot & Fragility Telemetry",
      badge: "Risk Prevention",
      frontDesc: "Identifies complex modules with high cyclomatic complexity, churn, and elevated bug propagation risk.",
      backTitle: "Fragility Scanner",
      backDesc: "Ranks top risk files using churn algorithms and complexity scores to prevent production regressions.",
      stats: "Automated Fragility Scoring"
    },
    {
      icon: <Code2 className="w-6 h-6 text-violet" />,
      title: "Automated Refactor Blueprint",
      badge: "Code Generation",
      frontDesc: "Compiles complete, drop-in replacement code scaffolds with TypeScript types and docstrings.",
      backTitle: "Clean Code Generator",
      backDesc: "Outputs decoupled interfaces, optimized async functions, and unit testable architectural scaffolds.",
      stats: "1-Click Download ZIP Scaffold"
    },
    {
      icon: <Cpu className="w-6 h-6 text-neon" />,
      title: "5-Agent Cooperative Mesh",
      badge: "Multi-Agent AI",
      frontDesc: "Specialized AI agents work concurrently in an automated pipeline to diagnose and blueprint.",
      backTitle: "Parallel Agent Mesh",
      backDesc: "Architecture, Debt, Risk, Planner, and Review agents run parallel diagnostic workloads concurrently.",
      stats: "5 Concurrent AI Agents"
    },
    {
      icon: <Terminal className="w-6 h-6 text-cyan" />,
      title: "Contextual Codebase Q&A",
      badge: "Live Telemetry",
      frontDesc: "Ask natural language questions about architecture, design patterns, or refactor strategies.",
      backTitle: "Vector Grounded QA",
      backDesc: "Query file structures, refactor strategies, or architectural bottlenecks with instant AI answers.",
      stats: "Context-Aware AI Assistant"
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
          {/* Headline */}
          <motion.h1 variants={fadeInUp} custom={0} className="home-hero-title">
            Deconstruct Codebases. <br />
            <span className="home-hero-gradient-text">Eliminate Technical Debt</span> with CodeGenome AI.
          </motion.h1>

          {/* Subtitle */}
          <motion.p variants={fadeInUp} custom={1} className="home-hero-subtitle">
            Deploy a cooperative network of 5 specialized AI agents to map repository architecture, 
            price technical debt in developer hours, pinpoint fragility hotspots, and compile automated refactor scaffolds.
          </motion.p>

          {/* Action Button */}
          <motion.div variants={fadeInUp} custom={2} className="home-hero-actions">
            <button className="run-button home-hero-cta-btn" onClick={() => onLaunchCockpit()}>
              <Play className="w-4 h-4 fill-current" />
              <span>Launch Refactor Cockpit</span>
            </button>
          </motion.div>

          {/* Stats Bar */}
          <motion.div variants={fadeInUp} custom={3} className="home-hero-stats">
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

        {/* Hero Terminal Mockup Visual */}
        <motion.div 
          className="home-hero-visual"
          initial={{ opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
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
                <p className="code-line text-muted">$ codegenome scan https://github.com/raghavacse2024-dotcom/codegenome-ai</p>
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

              {/* Embedded Visual Badges */}
              <div className="home-visual-badges-bar">
                <div className="home-inline-badge">
                  <Layers className="w-3.5 h-3.5 text-neon" />
                  <span>Module Map: Clean Boundaries</span>
                </div>
                <div className="home-inline-badge badge-cyan">
                  <DollarSign className="w-3.5 h-3.5 text-cyan" />
                  <span>Debt Index: B+ ($14,200)</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Section 1: What CodeGenome AI Is (Interactive 3D Flashcard Grid) */}
      <section className="home-section" id="capabilities">
        <motion.div 
          className="home-section-header"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={fadeInUp}
        >
          <span className="eyebrow">
            <Zap className="w-3.5 h-3.5 inline mr-1" />
            CORE CAPABILITIES
          </span>
          <h2>What CodeGenome AI Does</h2>
          <p className="home-section-desc">
            A comprehensive suite of autonomous code intelligence and structural telemetry tools.
          </p>
        </motion.div>

        <motion.div 
          className="home-grid-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={staggerContainer}
        >
          {features.map((feat, idx) => (
            <motion.div 
              key={idx}
              className="home-flashcard"
              variants={fadeInUp}
              custom={idx}
            >
              <div className="home-flashcard-inner">
                {/* Front Side */}
                <div className="home-flashcard-front">
                  <div className="home-card-header">
                    <div className="home-card-icon-box">
                      {feat.icon}
                    </div>
                    <span className="home-card-badge">{feat.badge}</span>
                  </div>
                  <h3>{feat.title}</h3>
                  <p>{feat.frontDesc}</p>
                </div>

                {/* Back Side */}
                <div className="home-flashcard-back">
                  <div className="home-card-header">
                    <span className="eyebrow text-xs text-neon">{feat.badge}</span>
                    <span className="home-card-badge border-cyan text-cyan">Telemetry</span>
                  </div>
                  <h4>{feat.backTitle}</h4>
                  <p>{feat.backDesc}</p>
                  <div className="home-flashcard-back-foot">
                    <CheckCircle2 className="w-3.5 h-3.5 text-neon" />
                    <span>{feat.stats}</span>
                  </div>
                </div>
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
          viewport={{ once: true, amount: 0.15 }}
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
          viewport={{ once: true, amount: 0.1 }}
          variants={staggerContainer}
        >
          {workflowSteps.map((step, idx) => (
            <motion.div 
              key={idx}
              className={`home-pipeline-step ${activeStep === idx ? 'is-active' : ''}`}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              onMouseEnter={() => setActiveStep(idx)}
              onMouseLeave={() => setActiveStep(null)}
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
          viewport={{ once: true, amount: 0.15 }}
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
          viewport={{ once: true, amount: 0.1 }}
          variants={staggerContainer}
        >
          {agentNetwork.map((agent, idx) => (
            <motion.div 
              key={idx}
              className="home-agent-card"
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              custom={idx}
            >
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

      {/* Section 5: Enterprise Infrastructure & Capabilities Bento Grid */}
      <section className="home-section" id="infrastructure">
        <motion.div 
          className="home-section-header"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={fadeInUp}
        >
          <span className="eyebrow">
            <Sparkles className="w-3.5 h-3.5 inline mr-1" />
            PLATFORM ARCHITECTURE & INFRASTRUCTURE
          </span>
          <h2>Engineered for Deep Codebase Intelligence</h2>
          <p className="home-section-subtitle">
            Autonomous multi-agent pipeline with AST graph indexing, sub-second impact resolution, and verified Git refactoring.
          </p>
        </motion.div>

        <div className="bento-grid-container">
          {/* Card 1: Zero-Trust Security & Sandbox Isolation */}
          <motion.div 
            className="bento-tile bento-tile-auth"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            custom={0}
          >
            <div className="bento-tile-header">
              <h3 className="bento-tile-title">Zero-Trust Sandbox & Isolation</h3>
            </div>

            <div className="bento-schematic-wrapper">
              <svg viewBox="0 0 320 150" className="bento-schematic-svg" preserveAspectRatio="xMidYMid meet">
                {/* Sandbox Boundary */}
                <rect x="15" y="15" width="290" height="120" rx="10" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                <rect x="95" y="32" width="130" height="86" rx="8" fill="rgba(34,197,94,0.05)" stroke="rgba(34,197,94,0.3)" />
                
                {/* Ingestion stream */}
                <path d="M 30,75 L 95,75" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx="35" cy="75" r="4" fill="#6b7280" />
                <path d="M 90,71 L 95,75 L 90,79" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
                <text x="35" y="62" fill="#9ca3af" fontSize="9" fontFamily="monospace">INGEST</text>

                {/* Enclave Core Lock Icon */}
                <rect x="145" y="62" width="30" height="24" rx="4" fill="#18181b" stroke="#22c55e" strokeWidth="1.5" />
                <path d="M 152,62 V 54 C 152,49 168,49 168,54 V 62" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                <circle cx="160" cy="72" r="2.5" fill="#22c55e" />
                <text x="160" y="102" textAnchor="middle" fill="#22c55e" fontSize="9.5" fontWeight="600" fontFamily="monospace">EPHEMERAL ENCLAVE</text>

                {/* Output stream */}
                <path d="M 225,75 L 285,75" stroke="#22c55e" strokeWidth="1.5" />
                <circle cx="285" cy="75" r="4" fill="#22c55e" />
                <path d="M 280,71 L 285,75 L 280,79" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                <text x="250" y="62" fill="#22c55e" fontSize="9" fontFamily="monospace">AST PASS</text>
              </svg>
            </div>

            <div className="bento-tile-footer">
              <p className="bento-tile-desc">
                Read-only static AST ingestion, ephemeral test containers, and zero-exposure repository isolation.
              </p>
            </div>
          </motion.div>

          {/* Card 2: Infinite AST & Topology Graph */}
          <motion.div 
            className="bento-tile bento-tile-infinity"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            custom={1}
          >
            <div className="bento-tile-header">
              <h3 className="bento-tile-title">Infinite AST & Topology Graph</h3>
            </div>

            <div className="bento-schematic-wrapper">
              <svg viewBox="0 0 540 150" className="bento-schematic-svg" preserveAspectRatio="xMidYMid meet">
                {/* Background Grid Lines */}
                <line x1="40" y1="75" x2="500" y2="75" stroke="rgba(255,255,255,0.05)" />
                <line x1="270" y1="20" x2="270" y2="130" stroke="rgba(255,255,255,0.05)" />

                {/* Root AST Node */}
                <circle cx="70" cy="75" r="18" fill="#18181b" stroke="#22c55e" strokeWidth="2" />
                <text x="70" y="79" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="700" fontFamily="monospace">ROOT</text>

                {/* Connector branches */}
                <path d="M 88,75 C 140,75 160,40 210,40" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
                <path d="M 88,75 L 210,75" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                <path d="M 88,75 C 140,75 160,110 210,110" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />

                {/* Tier 1 Modules */}
                <rect x="210" y="28" width="80" height="24" rx="4" fill="#18181b" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                <text x="250" y="44" textAnchor="middle" fill="#e4e4e7" fontSize="9.5" fontFamily="monospace">core/engine</text>

                <rect x="210" y="63" width="80" height="24" rx="4" fill="#18181b" stroke="#22c55e" strokeWidth="1.5" />
                <text x="250" y="79" textAnchor="middle" fill="#22c55e" fontSize="9.5" fontWeight="600" fontFamily="monospace">ast/graph</text>

                <rect x="210" y="98" width="80" height="24" rx="4" fill="#18181b" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                <text x="250" y="114" textAnchor="middle" fill="#e4e4e7" fontSize="9.5" fontFamily="monospace">api/routes</text>

                {/* Tier 2 Sub-Branches */}
                <path d="M 290,40 L 370,30" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
                <path d="M 290,40 L 370,52" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
                <path d="M 290,75 L 370,75" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                <path d="M 290,110 L 370,100" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
                <path d="M 290,110 L 370,122" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />

                {/* Leaf Nodes */}
                <circle cx="370" cy="30" r="4" fill="#a1a1aa" />
                <text x="382" y="33" fill="#a1a1aa" fontSize="8.5" fontFamily="monospace">Parser()</text>

                <circle cx="370" cy="52" r="4" fill="#a1a1aa" />
                <text x="382" y="55" fill="#a1a1aa" fontSize="8.5" fontFamily="monospace">Tokenizer()</text>

                <rect x="370" y="64" width="90" height="22" rx="3" fill="#18181b" stroke="#22c55e" strokeWidth="1" />
                <circle cx="380" cy="75" r="3" fill="#22c55e" />
                <text x="424" y="79" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="600" fontFamily="monospace">CyclicSafe: OK</text>

                <circle cx="370" cy="100" r="4" fill="#a1a1aa" />
                <text x="382" y="103" fill="#a1a1aa" fontSize="8.5" fontFamily="monospace">Handlers()</text>

                <circle cx="370" cy="122" r="4" fill="#a1a1aa" />
                <text x="382" y="125" fill="#a1a1aa" fontSize="8.5" fontFamily="monospace">Middleware()</text>
              </svg>
            </div>

            <div className="bento-tile-footer">
              <p className="bento-tile-desc">
                Continuous full-codebase recursive AST graph mapping across 40+ languages with zero scale limits.
              </p>
            </div>
          </motion.div>

          {/* Card 3: Sub-Second Blast Radius Trajectory */}
          <motion.div 
            className="bento-tile bento-tile-enterprise"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            custom={2}
          >
            <div className="bento-tile-header">
              <h3 className="bento-tile-title">Blast Radius Engine</h3>
            </div>

            <div className="bento-schematic-wrapper">
              <svg viewBox="0 0 320 150" className="bento-schematic-svg" preserveAspectRatio="xMidYMid meet">
                {/* Concentric Impact Ripple Rings */}
                <circle cx="110" cy="75" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <circle cx="110" cy="75" r="36" fill="rgba(34,197,94,0.04)" stroke="rgba(34,197,94,0.2)" />
                <circle cx="110" cy="75" r="18" fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth="1.5" />
                
                {/* Center Target Node */}
                <circle cx="110" cy="75" r="5" fill="#22c55e" />
                <text x="110" y="62" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700" fontFamily="monospace">Δ src/auth.ts</text>

                {/* Trajectory Vector to downstream consumers */}
                <path d="M 110,75 Q 180,45 250,55" fill="none" stroke="#22c55e" strokeWidth="2" />
                <circle cx="250" cy="55" r="4" fill="#22c55e" />
                <text x="250" y="44" textAnchor="middle" fill="#22c55e" fontSize="8.5" fontFamily="monospace">api/login.ts</text>

                <path d="M 110,75 Q 170,105 240,95" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx="240" cy="95" r="3.5" fill="#a1a1aa" />
                <text x="240" y="112" textAnchor="middle" fill="#a1a1aa" fontSize="8.5" fontFamily="monospace">middleware.ts</text>

                {/* Metrics pill */}
                <rect x="200" y="118" width="105" height="20" rx="3" fill="#18181b" stroke="rgba(255,255,255,0.15)" />
                <text x="252" y="132" textAnchor="middle" fill="#ffffff" fontSize="8.5" fontFamily="monospace">0.18s Impact Calc</text>
              </svg>
            </div>

            <div className="bento-tile-footer">
              <p className="bento-tile-desc">
                Predicts transitive breakages and ripple impact across thousands of imports in O(1) time.
              </p>
            </div>
          </motion.div>

          {/* Card 4: 100 Score Health & Clean Architecture */}
          <motion.div 
            className="bento-tile bento-tile-score"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            custom={3}
          >
            <div className="bento-tile-header">
              <h3 className="bento-tile-title">100/100 Code Health Index</h3>
            </div>

            <div className="bento-schematic-wrapper">
              <svg viewBox="0 0 320 150" className="bento-schematic-svg" preserveAspectRatio="xMidYMid meet">
                {/* Circular Gauge */}
                <circle cx="100" cy="75" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                <circle cx="100" cy="75" r="46" fill="none" stroke="#22c55e" strokeWidth="7" strokeDasharray="289" strokeDashoffset="0" strokeLinecap="round" transform="rotate(-90 100 75)" />
                
                {/* Score Number in Center */}
                <text x="100" y="81" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="800" fontFamily="monospace">100</text>
                <text x="100" y="96" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="600" fontFamily="monospace">OPTIMAL</text>

                {/* Health Metrics Breakdown on the right */}
                <g transform="translate(170, 35)">
                  <circle cx="5" cy="10" r="3" fill="#22c55e" />
                  <text x="16" y="13" fill="#f4f4f5" fontSize="9.5" fontFamily="monospace">Anti-Patterns: 0</text>

                  <circle cx="5" cy="32" r="3" fill="#22c55e" />
                  <text x="16" y="35" fill="#f4f4f5" fontSize="9.5" fontFamily="monospace">Circular Deps: 0</text>

                  <circle cx="5" cy="54" r="3" fill="#22c55e" />
                  <text x="16" y="57" fill="#f4f4f5" fontSize="9.5" fontFamily="monospace">Test Coverage: 98%</text>

                  <circle cx="5" cy="76" r="3" fill="#22c55e" />
                  <text x="16" y="79" fill="#22c55e" fontSize="9.5" fontWeight="600" fontFamily="monospace">Grade: A+ Clean</text>
                </g>
              </svg>
            </div>

            <div className="bento-tile-footer">
              <p className="bento-tile-desc">
                Automated architectural smell elimination, dead-code removal, and complexity optimization.
              </p>
            </div>
          </motion.div>

          {/* Card 5: 1-Click PR / Refactor Dispatch */}
          <motion.div 
            className="bento-tile bento-tile-publish"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            custom={4}
          >
            <div className="bento-tile-header">
              <h3 className="bento-tile-title">1-Click Refactor PR</h3>
            </div>

            <div className="bento-schematic-wrapper">
              <svg viewBox="0 0 320 150" className="bento-schematic-svg" preserveAspectRatio="xMidYMid meet">
                {/* Main Branch Line */}
                <line x1="25" y1="45" x2="295" y2="45" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                <circle cx="45" cy="45" r="4" fill="#a1a1aa" />
                <text x="45" y="32" textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="monospace">main</text>

                {/* Feature Refactor Branch */}
                <path d="M 80,45 C 105,45 115,95 140,95 L 220,95 C 245,95 255,45 280,45" fill="none" stroke="#22c55e" strokeWidth="2" />
                
                {/* Branch Commits */}
                <circle cx="150" cy="95" r="4" fill="#22c55e" />
                <text x="150" y="112" textAnchor="middle" fill="#a1a1aa" fontSize="8" fontFamily="monospace">ast:split</text>

                <circle cx="205" cy="95" r="4" fill="#22c55e" />
                <text x="205" y="112" textAnchor="middle" fill="#a1a1aa" fontSize="8" fontFamily="monospace">tests:pass</text>

                {/* Merge Commit Target */}
                <circle cx="280" cy="45" r="6" fill="#18181b" stroke="#22c55e" strokeWidth="2" />
                <circle cx="280" cy="45" r="2.5" fill="#22c55e" />

                {/* GitHub PR badge */}
                <rect x="95" y="60" width="130" height="22" rx="3" fill="#18181b" stroke="#22c55e" strokeWidth="1" />
                <text x="160" y="74" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="600" fontFamily="monospace">PR #108: Auto-Merge OK</text>
              </svg>
            </div>

            <div className="bento-tile-footer">
              <p className="bento-tile-desc">
                Autonomous agents draft branch fixes, run verification suites, and open verified GitHub Pull Requests.
              </p>
            </div>
          </motion.div>
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
          <div className="home-cta-grid">
            {/* Left Column: Heading & Subtitle */}
            <div className="home-cta-left">
              <h2 className="home-cta-title">Ready to Map & Refactor Your Codebase?</h2>
              <p className="home-cta-desc">
                Deploy the 5-agent network onto any public GitHub repository. 100% free, read-only scan protocol.
              </p>
            </div>

            {/* Right Column: Prompt Card with Running Example GitHub Links */}
            <div className="home-cta-right">
              <form className="home-cta-prompt-card" onSubmit={handleCtaSubmit}>
                <div className="home-cta-input-area">
                  <input
                    type="text"
                    className="home-cta-text-input"
                    value={ctaInput}
                    onChange={(e) => setCtaInput(e.target.value)}
                    placeholder=""
                    aria-label="GitHub Repository Link"
                    spellCheck={false}
                    autoComplete="off"
                  />

                  {/* Running example GitHub links in light background text */}
                  {!ctaInput && (
                    <div 
                      className="home-cta-running-text-overlay"
                      onClick={() => {
                        const currentExample = EXAMPLE_REPOS[placeholderIndex]
                        setCtaInput(currentExample)
                      }}
                    >
                      <span className="home-cta-running-text">{displayedPlaceholder}</span>
                      <span className="home-cta-cursor" />
                    </div>
                  )}
                </div>

                <div className="home-cta-card-bottom flex justify-end">
                  <button type="submit" className="home-cta-analyse-btn">
                    <span>Analyse</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer-inner flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="home-footer-brand">
            <span className="header-brand-tech-text text-lg">
              CODEGENOMEAI
            </span>
            <p className="text-xs text-muted mt-2">
              Autonomous multi-agent repository intelligence and refactor telemetry. Read-only scan protocol.
            </p>
          </div>
          <div className="home-footer-links flex items-center gap-4">
            <a
              href="https://github.com/raghavacse2024-dotcom/codegenome-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted hover:text-neon transition-colors flex items-center gap-1.5"
            >
              <GitBranch className="w-3.5 h-3.5 text-neon" />
              <span>github.com/raghavacse2024-dotcom/codegenome-ai</span>
            </a>
          </div>
        </div>
        <div className="home-footer-bottom">
          <p>© {new Date().getFullYear()} CodeGenome AI. Built for high-performance software engineering teams.</p>
        </div>
      </footer>
    </div>
  )
}
