export type Scaffold = { path: string; content: string }

export type QaCitation = {
  filePath: string
  startLine: number
  endLine: number
  symbols?: string[]
  score?: number
}

export type QaAnswer = {
  answer: string
  confidence?: number
  sourceFiles?: string[]
  citations?: QaCitation[]
  insufficientEvidence?: boolean
  unavailableDetails?: string
  provider?: string
  grounded?: boolean
}

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
  maxNestingLine?: number
  classCount: number
  importCount: number
  exportCount: number
  anyTypeCount: number
  jsxElementCount: number
  imports?: string[]
  functionHotspots?: {
    name: string
    startLine: number
    endLine: number
    lineSpan: number
    cyclomaticComplexity: number
  }[]
}

export type Hotspot = {
  path: string
  lines: number
  score: number
  signals: string[]
  ast?: AstMetrics
}

export type StructuredFinding = {
  id: string
  title: string
  explanation: string
  filePath: string | null
  startLine: number | null
  endLine: number | null
  lineNumbers: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  evidence: string
  suggestedImprovement: string
  confidence: number
  origin: 'static-analysis' | 'ai-reasoning'
  verifiedAgainstRepo: boolean
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

export type ValidationCheckStatus =
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'not_executed'
  | 'unknown'
  | 'sandbox_unavailable'

export type ValidationBreakdown = {
  staticAnalysis: ValidationCheckStatus
  syntaxValidation: ValidationCheckStatus
  dependencyValidation: ValidationCheckStatus
  testFrameworkCompatibility: ValidationCheckStatus
  sandboxAvailability?: ValidationCheckStatus
  testsExecuted: ValidationCheckStatus
  buildExecuted: ValidationCheckStatus
  lintExecution: ValidationCheckStatus
  typecheckExecution: ValidationCheckStatus
  securityGuardrails: ValidationCheckStatus
  contributionPolicy: ValidationCheckStatus
  humanReviewRequirement: ValidationCheckStatus
  githubPullRequestStatus: ValidationCheckStatus | string
}

export type RefactorValidation = {
  tests: 'passed' | 'failed' | 'skipped' | 'not_executed' | 'sandbox_unavailable'
  lint: 'passed' | 'failed' | 'skipped' | 'not_executed' | 'sandbox_unavailable'
  typecheck: 'passed' | 'failed' | 'skipped' | 'not_executed' | 'sandbox_unavailable'
  build: 'passed' | 'failed' | 'skipped' | 'not_executed' | 'sandbox_unavailable'
  policy?: 'passed' | 'failed' | 'skipped' | 'not_executed' | 'blocked' | 'unknown'
  sandboxAvailability?: 'passed' | 'sandbox_unavailable'
  syntaxValidation?: 'passed' | 'failed'
  dependencyValidation?: 'passed' | 'failed'
  staticValidation?: 'passed' | 'failed'
  executionValidation?: 'passed' | 'failed' | 'not_executed' | 'sandbox_unavailable'
  testFrameworkValidation?: 'passed' | 'failed'
  securityValidation?: 'passed' | 'failed'
  policyValidation?: 'passed' | 'failed' | 'blocked' | 'unknown'
  safeToPropose: boolean
}

export type PrState =
  | 'PR_ELIGIBLE'
  | 'PR_BLOCKED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'POLICY_UNKNOWN'
  | 'SANDBOX_UNAVAILABLE'

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
  validationBreakdown?: ValidationBreakdown
  sandboxAvailable?: boolean
  sandboxStatus?: 'AVAILABLE' | 'SANDBOX_UNAVAILABLE'
  unavailableReason?: string | null
  executionEnvironment?: string
  failedStep?: string | null
  allowsManualExport?: boolean
}

export type AnalysisCompleteness = 'complete' | 'partial' | 'sample-based' | 'unavailable'

export type Analysis = {
  analysisId: string
  userId?: string | null
  createdAt?: string
  repo: { owner: string; repository: string; url: string; description: string; stars: number; defaultBranch: string; private?: boolean }
  source: 'live' | 'demo-safe' | 'github-api' | 'github-archive' | 'demo'
  isDemo: boolean
  isFallback?: boolean
  fallbackReason?: string | null
  mode: 'live' | 'demo'
  events: AgentEvent[]
  projectInfo?: {
    languages?: [string, number][]
    frameworks?: string[]
    packageManagers?: string[]
    dependencies?: { name: string; version: string; source: string }[]
  }
  metadata?: {
    analyzedFileCount: number
    repositoryFileCount?: number
    samplingUsed: boolean
    completeness?: AnalysisCompleteness
    samplingLimit?: number
    skippedFileCount?: number
    excludedFileCount?: number
    totalAnalyzedBytes?: number
    analysisCoverage?: string
    samplingNotice?: string
    commitSha?: string | null
    cacheHit?: boolean
  }
  results: {
    architecture: {
      data: {
        framework: string
        layers: string[]
        violations: string[]
        summary: string
        aiSummary?: string | null
        findings?: StructuredFinding[]
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
        aiSummary?: string | null
        findings?: StructuredFinding[]
        astAnalyzedCount?: number
        avgCyclomaticComplexity?: number
        maxCyclomaticComplexity?: number
      }
    }
    cost: {
      data: {
        annualCost: number
        priority: string
        roiMonths: number
        assumption: string
        summary?: string
        aiSummary?: string | null
        findings?: StructuredFinding[]
      }
    }
    refactor: {
      data: {
        target: string
        steps: string[]
        scaffolds: Scaffold[]
        refactoredTarget?: string
        diff?: RefactorGitDiff
        language?: string
        testFramework?: string
        pullRequestTitle: string
        state?: PrState
        sandboxAvailable?: boolean
        sandboxStatus?: 'AVAILABLE' | 'SANDBOX_UNAVAILABLE'
        unavailableReason?: string | null
        policy?: ContributionPolicyResult
        validation?: RefactorValidation
        validationBreakdown?: ValidationBreakdown
        executionEnvironment?: string
        exitCodes?: Record<string, number | null>
        logs?: Record<string, string>
        findings?: StructuredFinding[]
        pipelineSteps?: { step: string; name: string; status: string; details?: string }[]
      }
    }
    review: {
      data: {
        verdict: string
        checks: string[]
        caveat?: string | null
        state?: PrState
        sandboxAvailable?: boolean
        sandboxStatus?: 'AVAILABLE' | 'SANDBOX_UNAVAILABLE'
        unavailableReason?: string | null
        policy?: ContributionPolicyResult
        validation?: RefactorValidation
        validationBreakdown?: ValidationBreakdown
        executionEnvironment?: string
        exitCodes?: Record<string, number | null>
        logs?: Record<string, string>
        findings?: StructuredFinding[]
        pipelineSteps?: { step: string; name: string; status: string; details?: string }[]
      }
    }
  }
}
