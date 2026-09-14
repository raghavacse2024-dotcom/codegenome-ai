import JSZip from 'jszip'
import { parseRepositoryUrl } from './contracts.js'
import { createDemoRepository } from './services/demoCacheService.js'
const MAX_FILES = 25, MAX_FILE_BYTES = 45_000
const CODE_EXTENSIONS = /\.(?:js|jsx|ts|tsx|py|java|go|rb|php|cs|rs|vue|svelte|css|html|sql)$/i
const LANGUAGE_BY_EXTENSION = { js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', java: 'Java', go: 'Go', rb: 'Ruby', php: 'PHP', cs: 'C#', rs: 'Rust', vue: 'Vue', svelte: 'Svelte', css: 'CSS', html: 'HTML', sql: 'SQL' }

const repositoryCache = new Map()
const REPO_CACHE_TTL = 1000 * 60 * 10 // 10 minutes

const getCleanToken = (customToken) => {
  if (customToken && typeof customToken === 'string') {
    const clean = customToken.trim()
    if (clean.length > 5 && !clean.startsWith('optional_') && !clean.startsWith('your_')) return clean
  }
  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token || token.startsWith('optional_') || token.startsWith('your_') || token.length < 10) return null
  return token
}

const headers = (customToken) => {
  const token = getCleanToken(customToken)
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CodeGenomeAI-App/1.0 (+https://github.com/raghavacse2024-dotcom/codegenome-ai)',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

function fallbackRepository(owner, repository, reason) {
  return createDemoRepository(owner, repository, reason, buildStructure)
}

async function githubFetch(path, customToken) {
  const response = await fetch(`https://api.github.com${path}`, { headers: headers(customToken), signal: AbortSignal.timeout(8_000) })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw Object.assign(
      new Error(response.status === 403 ? 'GitHub rate limit reached. Add GITHUB_TOKEN or Sign in with GitHub.' : (body.message || `GitHub returned ${response.status}`)),
      { status: response.status }
    )
  }
  return response.json()
}

async function fetchRepositoryArchive(owner, repository, customToken) {
  const branchCandidates = ['main', 'master']
  let lastFailure = null
  const authHeaders = headers(customToken)
  for (const branch of branchCandidates) {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repository}/zipball/${branch}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(8_000)
      })
      if (!response.ok) {
        // Fallback to direct codeload if public
        const publicRes = await fetch(`https://codeload.github.com/${owner}/${repository}/zip/refs/heads/${branch}`, { signal: AbortSignal.timeout(6_000) })
        if (!publicRes.ok) {
          lastFailure = new Error(`GitHub archive request returned ${response.status}.`)
          continue
        }
        var buffer = await publicRes.arrayBuffer()
      } else {
        var buffer = await response.arrayBuffer()
      }
      const zip = await JSZip.loadAsync(buffer)
      const files = []
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue
        const parts = entry.name.split('/')
        if (parts.length < 2) continue
        const path = parts.slice(1).join('/')
        if (!CODE_EXTENSIONS.test(path)) continue
        const content = (await entry.async('string')).slice(0, MAX_FILE_BYTES)
        if (!content) continue
        files.push({ path, size: content.length, content })
        if (files.length >= MAX_FILES) break
      }
      if (files.length) {
        return {
          repo: { owner, repository, url: `https://github.com/${owner}/${repository}`, description: '', stars: 0, defaultBranch: branch },
          files,
          structure: buildStructure(files),
          truncated: files.length >= MAX_FILES,
        }
      }
      lastFailure = new Error(`GitHub archive for ${branch} did not contain supported source files.`)
    } catch (error) {
      lastFailure = error
    }
  }
  return fallbackRepository(owner, repository, lastFailure?.message || 'GitHub archive fallback unavailable.')
}

const isTesting = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')

export function clearRepositoryCache() {
  repositoryCache.clear()
}

export async function fetchRepository(repositoryUrl, customToken = null) {
  const { owner, repository, url } = parseRepositoryUrl(repositoryUrl)
  const tokenForReq = getCleanToken(customToken)
  const cacheKey = `${owner}/${repository}${tokenForReq ? '_auth' : ''}`.toLowerCase()
  const cached = repositoryCache.get(cacheKey)
  if (!isTesting && cached && (Date.now() - cached.timestamp < REPO_CACHE_TTL)) {
    return cached.data
  }

  try {
    const metadata = await githubFetch(`/repos/${owner}/${repository}`, tokenForReq)
    const branch = metadata.default_branch || 'main'
    const tree = await githubFetch(`/repos/${owner}/${repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`, tokenForReq)
    const candidates = (tree.tree || []).filter((item) => item.type === 'blob' && CODE_EXTENSIONS.test(item.path) && item.size <= MAX_FILE_BYTES).slice(0, MAX_FILES)
    const files = await Promise.all(candidates.map(async (item) => {
      try {
        // If private repository, fetch blob via GitHub API with token
        if (tokenForReq || metadata.private) {
          const blobRes = await githubFetch(`/repos/${owner}/${repository}/git/blobs/${item.sha}`, tokenForReq)
          if (blobRes?.content) {
            const decoded = Buffer.from(blobRes.content, 'base64').toString('utf-8').slice(0, MAX_FILE_BYTES)
            return { path: item.path, size: item.size, content: decoded }
          }
        }
        const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repository}/${branch}/${item.path}`, { signal: AbortSignal.timeout(4_000) })
        return { path: item.path, size: item.size, content: raw.ok ? (await raw.text()).slice(0, MAX_FILE_BYTES) : '' }
      } catch {
        return { path: item.path, size: item.size, content: '' }
      }
    }))
    const sampledFiles = files.filter((file) => file.content)
    const result = { 
      repo: { owner, repository, url, description: metadata.description || '', stars: metadata.stargazers_count || 0, defaultBranch: branch, private: Boolean(metadata.private) }, 
      files: sampledFiles, 
      structure: buildStructure(sampledFiles), 
      truncated: (tree.tree || []).length > MAX_FILES 
    }
    if (!isTesting) {
      repositoryCache.set(cacheKey, { timestamp: Date.now(), data: result })
    }
    return result
  } catch (error) {
    console.warn('[GitHub] Primary API fetch failed, attempting archive or demo fallback:', error.message)
    try {
      const archiveResult = await fetchRepositoryArchive(owner, repository, tokenForReq)
      if (!isTesting) {
        repositoryCache.set(cacheKey, { timestamp: Date.now(), data: archiveResult })
      }
      return archiveResult
    } catch (archiveErr) {
      console.warn('[GitHub] Archive fallback also failed:', archiveErr.message)
    }
    const demoResult = fallbackRepository(owner, repository, error?.message || 'GitHub fetch unavailable')
    if (!isTesting) {
      repositoryCache.set(cacheKey, { timestamp: Date.now(), data: demoResult })
    }
    return demoResult
  }
}

export function buildStructure(files) {
  const rootDirectories = [...new Set(files.map((file) => file.path.split('/')[0]).filter(Boolean))].slice(0, 8)
  const languages = {}
  for (const file of files) {
    const extension = file.path.split('.').pop()?.toLowerCase()
    const language = LANGUAGE_BY_EXTENSION[extension] || 'Other'
    languages[language] = (languages[language] || 0) + 1
  }
  const entryPoints = files.filter((file) => /(^|\/)(main|index|app|server|routes?)\.(?:js|jsx|ts|tsx|py)$/i.test(file.path)).map((file) => file.path).slice(0, 6)
  return { sampledFileCount: files.length, rootDirectories, languages: Object.entries(languages).sort(([, left], [, right]) => right - left).slice(0, 5), entryPoints }
}
