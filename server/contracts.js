import { z } from 'zod'

export const RepoUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com' && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)
  } catch { return false }
}, 'Enter a public https://github.com/owner/repository URL.')

export const AnalyzeRequestSchema = z.object({ repositoryUrl: RepoUrlSchema })
export function parseRepositoryUrl(repositoryUrl) {
  const validUrl = RepoUrlSchema.parse(repositoryUrl)
  const [, owner, repository] = new URL(validUrl).pathname.split('/')
  return { owner, repository: repository.replace(/\.git$/, ''), url: `https://github.com/${owner}/${repository.replace(/\.git$/, '')}` }
}
