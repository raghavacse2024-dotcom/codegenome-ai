const demoFiles = [
  {
    path: 'src/features/repositoryAnalyzer.ts',
    content: `import { fetchTree } from '../integrations/githubClient'

export async function analyzeRepository(url: string) {
  const tree = await fetchTree(url)
  const candidates = tree.filter((file) => file.path.includes('src/'))
  return candidates.map((file) => ({ ...file, risk: file.size > 12000 ? 'high' : 'normal' }))
}
`,
  },
  {
    path: 'src/components/AgentTimeline.tsx',
    content: `export function AgentTimeline({ events }) {
  return events.map((event) => (
    <article key={event.agent}>
      <strong>{event.agent}</strong>
      <p>{event.rationale}</p>
    </article>
  ))
}
`,
  },
  {
    path: 'server/routes/analyze.js',
    content: `export async function analyzeRoute(request, response) {
  const result = await runPipeline(request.body.repositoryUrl)
  response.json(result)
}
`,
  },
  {
    path: 'server/services/scaffoldGenerator.js',
    content: `export function generateScaffolds(plan) {
  return { files: plan.steps.map((step, index) => ({ path: 'step-' + index + '.ts', content: step })) }
}
`,
  },
]

/**
 * Builds a deterministic repository sample for public demos when external GitHub
 * access is unavailable. The data is intentionally labeled by the analysis layer.
 * @param {string} owner GitHub owner from the requested URL.
 * @param {string} repository GitHub repository from the requested URL.
 * @param {string} reason Human-readable fallback cause.
 * @param {(files: Array<{path: string, content: string}>) => object} buildStructure Repository structure helper.
 * @returns {object} Repository-like sample consumed by the agent pipeline.
 */
export function createDemoRepository(owner, repository, reason, buildStructure) {
  const files = demoFiles.map((file) => ({ ...file, size: file.content.length }))
  return {
    repo: {
      owner,
      repository,
      url: `https://github.com/${owner}/${repository}`,
      description: 'Demo Mode Analysis: external GitHub access was unavailable, so CodeGenome used a deterministic representative sample.',
      stars: 0,
      defaultBranch: 'main',
    },
    files,
    structure: buildStructure(files),
    truncated: false,
    fallbackReason: reason,
  }
}
