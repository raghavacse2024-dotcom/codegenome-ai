import { fetchRepository } from '../github.js'
import { runAnalysis } from '../agents.js'

/**
 * Runs GitHub ingestion, full repository indexing, and all five CodeGenome agents with a hard timeout.
 * @param {string} repositoryUrl GitHub URL (public or private).
 * @param {string|null} token Optional personal access or OAuth token for private repositories.
 * @param {((event: object) => void)|null} onProgress Optional real-time progress callback.
 * @returns {Promise<object>} Completed analysis with explicit live vs fallback flags and coverage metadata.
 */
export async function analyzeRepository(repositoryUrl, token = null, onProgress = null) {
  const analysis = await withTimeout(async () => {
    if (typeof onProgress === 'function') {
      onProgress({
        agent: 'Ingestion',
        status: 'running',
        rationale: 'Fetching paginated repository tree, manifests, and source files from GitHub...',
        at: new Date().toISOString(),
      })
    }

    const repository = await fetchRepository(repositoryUrl, token)

    if (typeof onProgress === 'function') {
      const covLabel = repository.metadata?.completeness || 'sample-based'
      onProgress({
        agent: 'Ingestion',
        status: 'complete',
        rationale: repository.fallbackReason
          ? `Live snapshot unavailable (${repository.fallbackReason}). Loaded synthetic demo sample.`
          : `Indexed ${repository.files?.length || 0} source files (${covLabel} coverage). Initializing agent network.`,
        at: new Date().toISOString(),
      })
    }

    const result = await runAnalysis(repository, onProgress)
    result.files = repository.files || []
    result.policyFiles = repository.policyFiles || []
    result.repoIndex = repository.repoIndex || result.repoIndex || null
    result.projectInfo = repository.projectInfo || result.projectInfo || null
    result.fallbackReason = repository.fallbackReason || null
    result.isFallback = Boolean(repository.isFallback || repository.fallbackReason)

    const analyzedCount = repository.files?.length || 0
    const repoCount = repository.metadata?.repositoryFileCount || analyzedCount
    const isFullRepo = repoCount > 0 && repoCount === analyzedCount && !result.isFallback

    result.metadata = repository.metadata || {
      analyzedFileCount: analyzedCount,
      repositoryFileCount: repoCount,
      samplingUsed: !isFullRepo,
      completeness: result.isFallback ? 'unavailable' : isFullRepo ? 'complete' : 'partial',
      samplingLimit: 350,
      skippedFileCount: Math.max(0, repoCount - analyzedCount),
      excludedFileCount: 0,
      totalAnalyzedBytes: (repository.files || []).reduce((acc, f) => acc + (f.size || f.content?.length || 0), 0),
      analysisCoverage: isFullRepo ? '100%' : repoCount > 0 ? `${Math.round((analyzedCount / repoCount) * 100)}%` : 'sampled',
      samplingNotice: result.isFallback
        ? `Synthetic demo fallback (${repository.fallbackReason}).`
        : isFullRepo
        ? `Complete analysis of all ${analyzedCount} source files.`
        : `Partial analysis covering ${analyzedCount} of ${repoCount} eligible source files.`,
    }

    // Strip redundant outer agent wrapper source overrides and preserve real repo ingestion source
    result.ingestionSource = repository.source || (result.isFallback ? 'demo' : 'github-api')
    return result
  }, 60_000)

  const actualSource = analysis.ingestionSource || (analysis.fallbackReason ? 'demo' : 'github-api')
  const isLive = (actualSource === 'github-api' || actualSource === 'github-archive') && !analysis.fallbackReason && !analysis.isFallback

  return {
    ...analysis,
    isDemo: !isLive,
    isFallback: Boolean(analysis.isFallback || !isLive),
    fallbackReason: analysis.fallbackReason || null,
    mode: isLive ? 'live' : 'demo',
    source: isLive ? actualSource : 'demo',
  }
}

/**
 * Rejects a long-running operation after the supplied timeout.
 */
export function withTimeout(operation, timeoutMs) {
  return Promise.race([
    operation(),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            Object.assign(
              new Error('Timeout after 60 seconds. Repository too large or external APIs are slow.'),
              { status: 504 }
            )
          ),
        timeoutMs
      )
    ),
  ])
}
