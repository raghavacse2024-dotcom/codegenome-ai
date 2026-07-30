import { fetchRepository } from '../github.js'
import { runAnalysis } from '../agents.js'
import { generateScaffolds } from './scaffoldGenerator.js'

/**
 * Runs GitHub ingestion and all five CodeGenome agents with a hard timeout.
 * @param {string} repositoryUrl Public GitHub URL.
 * @returns {Promise<object>} Completed analysis with stable demo/live flags.
 */
export async function analyzeRepository(repositoryUrl) {
  const analysis = await withTimeout(async () => {
    const repository = await fetchRepository(repositoryUrl)
    const result = await runAnalysis(repository)
    const generated = generateScaffolds(result.results.refactor.data)
    result.results.refactor.data.scaffolds = generated.files
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
