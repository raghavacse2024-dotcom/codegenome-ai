import { z } from 'zod'

/**
 * Normalizes input repository strings into canonical https://github.com/owner/repo URLs.
 * Handles inputs like 'owner/repo', 'github.com/owner/repo', URLs with trailing slashes, or subpaths.
 */
export function normalizeRepositoryUrl(input) {
  if (!input || typeof input !== 'string') return ''
  let trimmed = input.trim()
  if (!trimmed) return ''

  // Format: 'owner/repo'
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    trimmed = `https://github.com/${trimmed}`
  } else if (trimmed.startsWith('github.com/')) {
    trimmed = `https://${trimmed}`
  } else if (trimmed.startsWith('http://github.com/')) {
    trimmed = trimmed.replace('http://', 'https://')
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        const owner = parts[0]
        const repository = parts[1].replace(/\.git$/, '')
        return `https://github.com/${owner}/${repository}`
      }
    }
  } catch {}

  return trimmed
}

export const RepoUrlSchema = z.string().transform(normalizeRepositoryUrl).refine((value) => {
  try {
    const url = new URL(value)
    return (url.hostname === 'github.com' || url.hostname === 'www.github.com') && /^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(url.pathname)
  } catch { return false }
}, 'Enter a valid GitHub https://github.com/owner/repository URL.')

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

