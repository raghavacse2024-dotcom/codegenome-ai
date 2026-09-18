export type Scaffold = { path: string; content: string }
export type QaAnswer = { answer: string; confidence?: number; sourceFiles?: string[]; provider?: string }
export type GitHubUser = {
  login: string
  name: string
  avatar_url: string
  html_url: string
}
export type UserRepo = {
  name: string
  fullName: string
  owner: string
  private: boolean
  url: string
  description?: string
  language?: string
  stars?: number
  updatedAt?: string
}
export type AstMetrics = {
  cyclomaticComplexity: number
  functionCount: number
  maxNestingDepth: number
  classCount: number
  importCount: number
  exportCount: number
  anyTypeCount: number
  jsxElementCount: number
  imports?: string[]
}

export type Hotspot = {
  path: string
  lines: number
  score: number
  signals: string[]
  ast?: AstMetrics
}

export type AgentEvent = {
  agent: string
  status: 'running' | 'complete' | 'failed' | string
  rationale: string
  at: string
}

export type GitDiffHunkLine = {
  type: 'add' | 'del' | 'normal'
  oldLineNumber?: number
  newLineNumber?: number
  content: string
}

export type GitDiffHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  lines: GitDiffHunkLine[]
}

export type FileDiff = {
  path: string
  status: 'modified' | 'added' | 'deleted'
  oldContent?: string
  newContent: string
  patch: string
  additions: number
  deletions: number
  hunks: GitDiffHunk[]
}

export type RefactorGitDiff = {
  summary: {
    filesChanged: number
    additions: number
    deletions: number
  }
  rawPatch: string
  files: FileDiff[]
}

export type PullRequestResult = {
  success: boolean
  mode: 'live' | 'simulated'
  pushed?: boolean
  prUrl?: string
  prNumber?: number
  branch: string
  baseBranch: string
  title: string
  body: string
  patch?: string
  cliCommand?: string
  message?: string
}

export type Analysis = {
  analysisId: string
  createdAt?: string
  repo: { owner: string; repository: string; url: string; description: string; stars: number; defaultBranch: string }
  source: 'live' | 'demo-safe'
  isDemo: boolean
  mode: 'live' | 'demo'
  events: AgentEvent[]
  results: {
    architecture: { 
      data: { 
        framework: string
        layers: string[]
        violations: string[]
        summary: string
        circularDependencies?: { cycle: string[]; description: string }[]
        structure: { 
          sampledFileCount: number
          rootDirectories: string[]
          languages: [string, number][]
          entryPoints: string[] 
        } 
      } 
    }
    debt: { 
      data: { 
        hotspots: Hotspot[]
        totalDebtScore: number
        summary: string
        astAnalyzedCount?: number
        avgCyclomaticComplexity?: number
        maxCyclomaticComplexity?: number
      } 
    }
    cost: { data: { annualCost: number; priority: string; roiMonths: number; assumption: string } }
    refactor: { 
      data: { 
        target: string
        steps: string[]; 
        scaffolds: Scaffold[]
        refactoredTarget?: string
        diff?: RefactorGitDiff
        pullRequestTitle: string 
      } 
    }
    review: { data: { verdict: string; checks: string[]; caveat?: string | null } }
  }
}
