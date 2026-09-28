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

export type RefactorValidation = {
  tests: 'passed' | 'failed' | 'skipped' | 'not_executed'
  lint: 'passed' | 'failed' | 'skipped' | 'not_executed'
  typecheck: 'passed' | 'failed' | 'skipped' | 'not_executed'
  build: 'passed' | 'failed' | 'skipped' | 'not_executed'
  policy?: 'passed' | 'failed' | 'skipped' | 'not_executed'
  syntaxValidation?: 'passed' | 'failed'
  dependencyValidation?: 'passed' | 'failed'
  staticValidation?: 'passed' | 'failed'
  testFrameworkValidation?: 'passed' | 'failed'
  securityValidation?: 'passed' | 'failed'
  policyValidation?: 'passed' | 'failed' | 'blocked' | 'unknown'
  safeToPropose: boolean
}

export type PrState = 'PR_ELIGIBLE' | 'PR_BLOCKED' | 'HUMAN_REVIEW_REQUIRED' | 'VALIDATION_FAILED' | 'POLICY_UNKNOWN'

export type ContributionPolicyState = 'ALLOWED' | 'BLOCKED' | 'UNKNOWN'

export type GitHubPrStatus =
  | 'NOT_ATTEMPTED'
  | 'BRANCH_CREATED_PR_NOT_CREATED'
  | 'PR_CREATED'
  | 'GITHUB_OPERATION_FAILED'

export type ContributionPolicyResult = {
  status: ContributionPolicyState
  isBlocked: boolean
  policyFile: string | null
  ruleSnippet: string | null
  explanation: string
  allowsManualExport?: boolean
}

export type PullRequestResult = {
  success: boolean
  mode: 'live' | 'ready' | 'simulated' | 'blocked' | 'validation_failed' | 'review_required'
  githubStatus?: GitHubPrStatus
  prCreated?: boolean
  state?: PrState
  policy?: ContributionPolicyResult
  pushed?: boolean
  prUrl?: string | null
  compareUrl?: string | null
  prNumber?: number
  branch: string
  baseBranch: string
  title: string
  body: string
  patch?: string
  cliCommand?: string
  message?: string
  error?: string
  violations?: string[]
  isHighRisk?: boolean
  validation?: RefactorValidation
  failedStep?: string | null
  allowsManualExport?: boolean
}

export type Analysis = {
  analysisId: string
  userId?: string | null
  createdAt?: string
  repo: { owner: string; repository: string; url: string; description: string; stars: number; defaultBranch: string; private?: boolean }
  source: 'live' | 'demo-safe'
  isDemo: boolean
  mode: 'live' | 'demo'
  events: AgentEvent[]
  metadata?: {
    analyzedFileCount: number
    repositoryFileCount?: number
    samplingUsed: boolean
    samplingLimit?: number
    skippedFileCount?: number
    totalAnalyzedBytes?: number
    analysisCoverage?: string
    samplingNotice?: string
  }
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
        language?: string
        testFramework?: string
        pullRequestTitle: string
        state?: PrState
        policy?: ContributionPolicyResult
        validation?: RefactorValidation
        pipelineSteps?: { step: string; name: string; status: string; details?: string }[]
      } 
    }
    review: { 
      data: { 
        verdict: string
        checks: string[]
        caveat?: string | null
        state?: PrState
        policy?: ContributionPolicyResult
        validation?: RefactorValidation
      } 
    }
  }
}
