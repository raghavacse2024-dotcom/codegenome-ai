export type Scaffold = { path: string; content: string }
export type QaAnswer = { answer: string; confidence: number; sourceFiles: string[] }
export type Analysis = {
  analysisId: string
  createdAt?: string
  repo: { owner: string; repository: string; url: string; description: string; stars: number; defaultBranch: string }
  source: 'live' | 'demo-safe'
  isDemo: boolean
  mode: 'live' | 'demo'
  events: { agent: string; status: string; rationale: string; at: string }[]
  results: {
    architecture: { data: { framework: string; layers: string[]; violations: string[]; summary: string; structure: { sampledFileCount: number; rootDirectories: string[]; languages: [string, number][]; entryPoints: string[] } } }
    debt: { data: { hotspots: { path: string; lines: number; score: number; signals: string[] }[]; totalDebtScore: number; summary: string } }
    cost: { data: { annualCost: number; priority: string; roiMonths: number; assumption: string } }
    refactor: { data: { target: string; steps: string[]; scaffolds: Scaffold[]; pullRequestTitle: string } }
    review: { data: { verdict: string; checks: string[]; caveat?: string | null } }
  }
}
