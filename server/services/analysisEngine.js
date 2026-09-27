import { fetchRepository } from '../github.js'
import { runAnalysis } from '../agents.js'
import { generateScaffolds } from './scaffoldGenerator.js'
import { validateRefactor } from './refactorValidator.js'

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
    const generated = generateScaffolds(result.results.refactor.data, targetFile, repository.files || [])
    result.results.refactor.data.scaffolds = generated.files
    result.results.refactor.data.refactoredTarget = generated.refactoredTargetContent
    result.results.refactor.data.diff = generated.diff
    result.results.refactor.data.language = generated.language
    result.results.refactor.data.testFramework = generated.testFramework

    const validationResult = await validateRefactor({
      files: generated.files,
      targetPath,
      refactoredTarget: generated.refactoredTargetContent,
      baseFiles: repository.files || [],
      patch: generated.diff?.rawPatch || '',
    })

    result.results.refactor.data.state = validationResult.state
    result.results.refactor.data.validation = validationResult.validation
    result.results.refactor.data.policy = validationResult.policy
    result.results.refactor.data.pipelineSteps = validationResult.pipelineSteps
    result.results.review.data.state = validationResult.state
    result.results.review.data.policy = validationResult.policy
    result.results.review.data.verdict = validationResult.policy.isBlocked
      ? 'Policy Blocked'
      : (validationResult.validation.safeToPropose ? 'Verified' : 'Validation Failed')

    const analyzedCount = repository.files?.length || 0
    const repoCount = repository.metadata?.repositoryFileCount || analyzedCount
    const isFullRepo = repoCount > 0 && repoCount === analyzedCount

    result.metadata = repository.metadata || {
      analyzedFileCount: analyzedCount,
      repositoryFileCount: repoCount,
      samplingUsed: !isFullRepo,
      samplingLimit: 25,
      skippedFileCount: Math.max(0, repoCount - analyzedCount),
      totalAnalyzedBytes: (repository.files || []).reduce((acc, f) => acc + (f.size || f.content?.length || 0), 0),
      analysisCoverage: isFullRepo ? '100%' : (repoCount > 0 ? `${Math.round((analyzedCount / repoCount) * 100)}%` : 'sampled'),
      samplingNotice: isFullRepo
        ? `Analysis of ${analyzedCount} files in repository.`
        : `Analysis is based on a sampled subset of ${analyzedCount} repository files.`
    }
    return result
  }, 60_000)

  // Real repository source strictly determines mode — never assume live solely from token or user auth
  const actualSource = analysis.source || (analysis.fallbackReason ? 'demo' : 'github-api')
  const isLive = (actualSource === 'github-api' || actualSource === 'github-archive') && !analysis.fallbackReason

  return {
    ...analysis,
    isDemo: !isLive,
    mode: isLive ? 'live' : 'demo',
    source: isLive ? actualSource : 'demo',
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
