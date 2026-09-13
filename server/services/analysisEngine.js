import { fetchRepository } from '../github.js'
import { runAnalysis } from '../agents.js'
import { generateScaffolds } from './scaffoldGenerator.js'

/**
 * Runs GitHub ingestion and all five CodeGenome agents with a hard timeout.
 * @param {string} repositoryUrl GitHub URL (public or private).
 * @param {string|null} token Optional personal access or OAuth token for private repositories.
 * @param {((event: object) => void)|null} onProgress Optional real-time progress callback.
 * @returns {Promise<object>} Completed analysis with stable demo/live flags.
 */
export async function analyzeRepository(repositoryUrl, token = null, onProgress = null) {
  const analysis = await withTimeout(async () => {
    if (typeof onProgress === 'function') {
      onProgress({ agent: 'Ingestion', status: 'running', rationale: 'Fetching repository manifest and source trees from GitHub API...', at: new Date().toISOString() })
    }
    const repository = await fetchRepository(repositoryUrl, token)
    if (typeof onProgress === 'function') {
      onProgress({ agent: 'Ingestion', status: 'complete', rationale: `Sampled ${repository.files?.length || 0} source files. Initializing agent network.`, at: new Date().toISOString() })
    }
    const result = await runAnalysis(repository, onProgress)
    const targetPath = result.results.refactor.data.target
    const targetFile = repository.files?.find((f) => f.path === targetPath) || repository.files?.[0] || null
    const generated = generateScaffolds(result.results.refactor.data, targetFile)
    result.results.refactor.data.scaffolds = generated.files
    result.results.refactor.data.refactoredTarget = generated.refactoredTargetContent
    result.results.refactor.data.diff = generated.diff
    return result
  }, 60_000)

  return {
    ...analysis,
    isDemo: analysis.source !== 'live',
    mode: analysis.source === 'live' ? 'live' : 'demo',
  }
}

/**
 * Rejects a long-running operation after the supplied timeout.
 * @param {() => Promise<object>} operation Async operation to run.
 * @param {number} timeoutMs Timeout in milliseconds.
 * @returns {Promise<object>} Operation result.
 */
export function withTimeout(operation, timeoutMs) {
  return Promise.race([
    operation(),
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timeout after 60 seconds. Repo too large or external APIs are slow.'), { status: 504 })), timeoutMs)),
  ])
}
