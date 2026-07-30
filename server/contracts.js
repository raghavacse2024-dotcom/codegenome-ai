import { z } from 'zod'

export const RepoUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)
  } catch { return false }
}, 'Enter a public https://github.com/owner/repository URL.')

export const AnalyzeRequestSchema = z.object({ repositoryUrl: RepoUrlSchema })
export const AnalysisIdSchema = z.object({ analysisId: z.string().uuid('Run an analysis before using this action.') })
export const QaRequestSchema = AnalysisIdSchema.extend({ question: z.string().trim().min(3, 'Ask a specific repository question.').max(500, 'Questions must stay under 500 characters.') })

/**
 * Normalizes and validates a public GitHub repository URL.
 * @param {string} repositoryUrl User-supplied GitHub URL.
 * @returns {{owner: string, repository: string, url: string}} Canonical repository coordinates.
 */
export function parseRepositoryUrl(repositoryUrl) {
  const validUrl = RepoUrlSchema.parse(repositoryUrl)
  const [, owner, repository] = new URL(validUrl).pathname.split('/')
  return { owner, repository: repository.replace(/\.git$/, ''), url: `https://github.com/${owner}/${repository.replace(/\.git$/, '')}` }
}
