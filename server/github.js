import JSZip from 'jszip'
import { parseRepositoryUrl } from './contracts.js'
import { createDemoRepository } from './services/demoCacheService.js'
import { isSensitiveFile } from './services/secretRedactor.js'
import {
  isExcludedRepoPath,
  isManifestFile,
  CODE_OR_CONFIG_EXTENSIONS,
  buildRepositoryIndex,
} from './services/repoIndexer.js'
import {
  assertSafeGitHubUrl,
  validateRepoSegment,
  sanitizeRepoFilePath,
} from './services/urlSecurity.js'

const MAX_FILE_BYTES = 65_000
const MAX_TOTAL_ANALYZED_BYTES = 2_000_000

export function isRepositoryPolicyFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  const lower = filePath.toLowerCase().replace(/^\/+/, '')
  const baseName = lower.split('/').pop() || ''

  if (/^(?:agents|contributing|copilot[-_]instructions|code_of_conduct|security|pull_request_template|pr_template)(?:\.(?:md|rst|txt))?$/i.test(baseName)) {
    return true
  }

  if (lower.startsWith('.github/') || lower.includes('/.github/')) {
    if (/(?:contribut|policy|guideline|agent|copilot|instruction|pr_template|pull_request_template|dependabot)/i.test(lower)) {
      return true
    }
  }

  if (lower.startsWith('docs/') || lower.includes('/docs/')) {
    if (/(?:contribut|policy|agent|guideline)/i.test(baseName)) {
      return true
    }
  }

  return false
}

const getLimitFiles = (customToken) => {
  return getCleanToken(customToken) ? 350 : 120
}

const LANGUAGE_BY_EXTENSION = {
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  py: 'Python',
  pyi: 'Python',
  java: 'Java',
  go: 'Go',
  rb: 'Ruby',
  php: 'PHP',
  cs: 'C#',
  rs: 'Rust',
  vue: 'Vue',
  svelte: 'Svelte',
  css: 'CSS',
  scss: 'CSS',
  html: 'HTML',
  sql: 'SQL',
}

const repositoryCache = new Map()
const shaCache = new Map()
const REPO_CACHE_TTL = 1000 * 60 * 15 // 15 minutes

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
    'User-Agent': 'CodeGenomeAI-App/1.0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function computeSamplingMetadata({
  analyzedFiles,
  totalFiles = null,
  eligibleSourceFiles = null,
  excludedCount = 0,
  limit = 120,
  policyFilesDiscovered = [],
  policyFilesInspected = [],
  policyInspectionComplete = false,
  samplingStatus = null,
  commitSha = null,
  cacheHit = false,
}) {
  const analyzedFileCount = analyzedFiles.length
  const repositoryFileCount = eligibleSourceFiles !== null
    ? eligibleSourceFiles
    : (totalFiles !== null ? totalFiles : analyzedFileCount)
  const samplingUsed = repositoryFileCount > analyzedFileCount
  const skippedFileCount = Math.max(0, repositoryFileCount - analyzedFileCount)
  const totalAnalyzedBytes = analyzedFiles.reduce((acc, f) => acc + (f.size || f.content?.length || 0), 0)

  let analysisCoverage = '0%'
  let completeness = 'sample-based'
  let status = samplingStatus || (samplingUsed ? 'sampled' : 'full')

  if (repositoryFileCount === 0 || analyzedFileCount === 0) {
    status = 'unavailable'
    completeness = 'unavailable'
    analysisCoverage = '0%'
  } else if (!samplingUsed && repositoryFileCount <= analyzedFileCount) {
    status = 'full'
    completeness = 'complete'
    analysisCoverage = '100%'
  } else if (repositoryFileCount > 0) {
    const ratio = Math.round((analyzedFileCount / repositoryFileCount) * 100)
    analysisCoverage = `${Math.min(99, Math.max(1, ratio))}%`
    if (ratio >= 60) {
      status = 'partial'
      completeness = 'partial'
    } else {
      status = 'sampled'
      completeness = 'sample-based'
    }
  }

  const samplingNotice = completeness === 'complete'
    ? `Complete repository analysis: all ${analyzedFileCount} indexable source/config files analyzed (excluding ${excludedCount} dependency/build artifacts).`
    : completeness === 'partial'
    ? `Partial repository analysis: ${analyzedFileCount} of ${repositoryFileCount} source files indexed (${analysisCoverage} coverage; ${excludedCount} generated/dependency files excluded).`
    : completeness === 'sample-based'
    ? `Sample-based repository analysis: ${analyzedFileCount} of ${repositoryFileCount} source files analyzed (${analysisCoverage} coverage).`
    : `Repository files were unavailable from GitHub; using resilient demo-safe analysis.`

  return {
    analyzedFileCount,
    repositoryFileCount,
    totalTreeFiles: totalFiles !== null ? totalFiles : repositoryFileCount,
    excludedFileCount: excludedCount,
    samplingUsed,
    samplingLimit: limit,
    skippedFileCount,
    totalAnalyzedBytes,
    analysisCoverage,
    samplingStatus: status,
    completeness,
    samplingNotice,
    commitSha,
    cacheHit,
    policyFilesDiscovered,
    policyFilesInspected,
    policyInspectionComplete,
  }
}

function fallbackRepository(owner, repository, reason) {
  const demo = createDemoRepository(owner, repository, reason, buildStructure)
  const repoIndex = buildRepositoryIndex(demo.files)
  const metadata = computeSamplingMetadata({
    analyzedFiles: demo.files,
    totalFiles: demo.files.length,
    eligibleSourceFiles: demo.files.length,
    limit: 25,
    policyFilesDiscovered: [],
    policyFilesInspected: [],
    policyInspectionComplete: false,
    samplingStatus: 'unavailable',
  })
  metadata.samplingNotice = `GitHub repository files could not be retrieved (${reason}). Showing clearly labeled synthetic demo fallback.`
  metadata.analysisCoverage = 'unavailable'
  metadata.completeness = 'unavailable'
  return {
    ...demo,
    source: 'demo',
    mode: 'demo',
    policyFiles: [],
    repoIndex,
    metadata,
  }
}

async function githubFetch(apiPath, customToken) {
  const targetUrl = `https://api.github.com${apiPath}`
  assertSafeGitHubUrl(targetUrl)
  const response = await fetch(targetUrl, { headers: headers(customToken), signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw Object.assign(
      new Error(response.status === 403 ? 'GitHub rate limit reached. Please Sign in with GitHub.' : (body.message || `GitHub returned ${response.status}`)),
      { status: response.status }
    )
  }
  return response.json()
}

/**
 * Paginated directory tree traversal via GitHub Git Trees API when recursive=1 is truncated.
 * Traverses breadth-first through non-excluded directories so large repos are thoroughly indexed.
 */
async function fetchPaginatedGitTree(owner, repository, rootTreeSha, customToken, maxNodes = 2500) {
  const collectedBlobs = []
  const queue = [{ sha: rootTreeSha, prefix: '' }]
  const visitedTrees = new Set()
  let pagesFetched = 0
  const maxTreeRequests = 25

  while (queue.length > 0 && pagesFetched < maxTreeRequests && collectedBlobs.length < maxNodes) {
    const { sha, prefix } = queue.shift()
    if (!sha || visitedTrees.has(sha)) continue
    visitedTrees.add(sha)
    pagesFetched++

    const treeData = await githubFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/trees/${encodeURIComponent(sha)}`,
      customToken
    )
    for (const item of treeData.tree || []) {
      const fullPath = prefix ? `${prefix}/${item.path}` : item.path
      if (item.type === 'tree') {
        if (!isExcludedRepoPath(`${fullPath}/placeholder`)) {
          queue.push({ sha: item.sha, prefix: fullPath })
        }
      } else if (item.type === 'blob') {
        collectedBlobs.push({ ...item, path: fullPath })
      }
    }
  }

  return collectedBlobs
}

/**
 * Prioritizes manifests, entrypoints, core source files, and tests ahead of auxiliary files.
 */
function prioritizeCandidateBlobs(blobs) {
  return [...blobs].sort((a, b) => {
    const score = (p) => {
      if (isManifestFile(p)) return 100
      if (/^(?:src|app|server|lib|core|packages\/[^/]+\/src)\//i.test(p)) return 80
      if (/(?:main|index|app|server|router|routes|api)\./i.test(p)) return 70
      if (/\.(?:ts|tsx|js|jsx|py|go|rs|java)$/i.test(p)) return 50
      if (/test|spec/i.test(p)) return 30
      return 10
    }
    return score(b.path) - score(a.path)
  })
}

async function fetchRepositoryArchive(owner, repository, customToken, preferredBranch = null) {
  const branchCandidates = preferredBranch ? [preferredBranch, 'main', 'master'] : ['main', 'master']
  const uniqueBranches = [...new Set(branchCandidates.filter(Boolean))]
  let lastFailure = null
  const authHeaders = headers(customToken)
  const limit = getLimitFiles(customToken)

  for (const branch of uniqueBranches) {
    try {
      const apiArchiveUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/zipball/${encodeURIComponent(branch)}`
      assertSafeGitHubUrl(apiArchiveUrl)
      const response = await fetch(apiArchiveUrl, {
        headers: authHeaders,
        signal: AbortSignal.timeout(12_000),
      })

      let buffer
      if (!response.ok) {
        const publicZipUrl = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/zip/refs/heads/${encodeURIComponent(branch)}`
        assertSafeGitHubUrl(publicZipUrl)
        const publicRes = await fetch(publicZipUrl, { signal: AbortSignal.timeout(10_000) })
        if (!publicRes.ok) {
          lastFailure = new Error(`GitHub archive request returned ${response.status}.`)
          continue
        }
        buffer = await publicRes.arrayBuffer()
      } else {
        buffer = await response.arrayBuffer()
      }

      const zip = await JSZip.loadAsync(buffer)
      const files = []
      const policyFiles = []
      let totalFiles = 0
      let excludedCount = 0
      let eligibleSourceFiles = 0
      let totalBytesAccumulated = 0

      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue
        totalFiles++
        const parts = entry.name.split('/')
        if (parts.length < 2) continue
        const filePath = sanitizeRepoFilePath(parts.slice(1).join('/'))
        if (!filePath) continue

        if (isSensitiveFile(filePath)) {
          excludedCount++
          continue
        }

        if (isRepositoryPolicyFile(filePath)) {
          const policyContent = (await entry.async('string')).slice(0, MAX_FILE_BYTES)
          if (policyContent) {
            policyFiles.push({ path: filePath, size: policyContent.length, content: policyContent })
          }
          continue
        }

        if (isExcludedRepoPath(filePath)) {
          excludedCount++
          continue
        }

        if (!CODE_OR_CONFIG_EXTENSIONS.test(filePath) && !isManifestFile(filePath)) continue
        eligibleSourceFiles++

        if (files.length < limit && totalBytesAccumulated < MAX_TOTAL_ANALYZED_BYTES) {
          const content = (await entry.async('string')).slice(0, MAX_FILE_BYTES)
          if (!content) continue
          files.push({ path: filePath, size: content.length, content })
          totalBytesAccumulated += content.length
        }
      }

      if (files.length) {
        const repoIndex = buildRepositoryIndex(files)
        const metadata = computeSamplingMetadata({
          analyzedFiles: files,
          totalFiles,
          eligibleSourceFiles,
          excludedCount,
          limit,
          policyFilesDiscovered: policyFiles.map((p) => p.path),
          policyFilesInspected: policyFiles.map((p) => p.path),
          policyInspectionComplete: true,
        })
        return {
          repo: {
            owner,
            repository,
            url: `https://github.com/${owner}/${repository}`,
            description: '',
            stars: 0,
            defaultBranch: branch,
          },
          files,
          policyFiles,
          repoIndex,
          structure: buildStructure(files, repoIndex.projectInfo),
          truncated: eligibleSourceFiles > files.length,
          metadata,
          source: 'github-archive',
          mode: 'live',
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
  shaCache.clear()
}

async function fetchBlobContent({ owner, repository, branch, item, tokenForReq, isPrivate }) {
  const safePath = sanitizeRepoFilePath(item.path)
  if (!safePath) return ''

  if (tokenForReq || isPrivate) {
    const blobRes = await githubFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/blobs/${encodeURIComponent(item.sha)}`,
      tokenForReq
    )
    if (blobRes?.content) {
      return Buffer.from(blobRes.content, 'base64').toString('utf-8').slice(0, MAX_FILE_BYTES)
    }
  }

  const encodedPath = safePath.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(branch)}/${encodedPath}`
  assertSafeGitHubUrl(rawUrl)
  const raw = await fetch(rawUrl, { signal: AbortSignal.timeout(5_000) })
  return raw.ok ? (await raw.text()).slice(0, MAX_FILE_BYTES) : ''
}

export async function fetchRepository(repositoryUrl, customToken = null) {
  const { owner: rawOwner, repository: rawRepo, url } = parseRepositoryUrl(repositoryUrl)
  const owner = validateRepoSegment(rawOwner, 'owner')
  const repository = validateRepoSegment(rawRepo, 'repository')

  const tokenForReq = getCleanToken(customToken)
  const cacheKey = `${owner}/${repository}${tokenForReq ? '_auth' : ''}`.toLowerCase()
  const cached = repositoryCache.get(cacheKey)
  if (!isTesting && cached && (Date.now() - cached.timestamp < REPO_CACHE_TTL)) {
    return {
      ...cached.data,
      metadata: { ...cached.data.metadata, cacheHit: true },
    }
  }

  try {
    const limit = getLimitFiles(customToken)
    const repoMeta = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`, tokenForReq)
    const branch = repoMeta.default_branch || 'main'

    const tree = await githubFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      tokenForReq
    )

    const commitSha = tree?.sha || null
    const shaCacheKey = commitSha ? `${owner}/${repository}@${commitSha}${tokenForReq ? '_auth' : ''}`.toLowerCase() : null
    if (!isTesting && shaCacheKey && shaCache.has(shaCacheKey)) {
      const shaCached = shaCache.get(shaCacheKey)
      return {
        ...shaCached,
        metadata: { ...shaCached.metadata, cacheHit: true },
      }
    }

    let allTreeBlobs = (tree.tree || []).filter((item) => item.type === 'blob')
    // If GitHub truncated the recursive tree (large repo), perform paginated breadth-first traversal
    if (tree.truncated && tree.sha) {
      try {
        const paginatedBlobs = await fetchPaginatedGitTree(owner, repository, tree.sha, tokenForReq)
        if (paginatedBlobs.length > allTreeBlobs.length) {
          allTreeBlobs = paginatedBlobs
        }
      } catch (pagErr) {
        console.warn('[GitHub] Paginated tree traversal notice:', pagErr.message)
      }
    }

    const totalFiles = allTreeBlobs.length

    // 1. Separate Policy & Configuration Files Discovery
    const policyBlobs = allTreeBlobs.filter((item) => isRepositoryPolicyFile(item.path))
    const policyFilesDiscovered = policyBlobs.map((item) => item.path)

    const rawPolicyFiles = await Promise.all(policyBlobs.map(async (item) => {
      try {
        const text = await fetchBlobContent({
          owner,
          repository,
          branch,
          item,
          tokenForReq,
          isPrivate: Boolean(repoMeta.private),
        })
        return { path: item.path, size: item.size, content: text }
      } catch {
        return { path: item.path, size: item.size, content: '' }
      }
    }))
    const validPolicyFiles = rawPolicyFiles.filter((f) => f.content)
    const policyFilesInspected = validPolicyFiles.map((f) => f.path)
    const policyInspectionComplete = true

    // 2. Exclude unnecessary directories/generated files & identify eligible source/manifest files
    let excludedCount = 0
    const eligibleBlobs = []
    for (const item of allTreeBlobs) {
      if (isRepositoryPolicyFile(item.path)) continue
      if (isSensitiveFile(item.path) || isExcludedRepoPath(item.path)) {
        excludedCount++
        continue
      }
      if ((CODE_OR_CONFIG_EXTENSIONS.test(item.path) || isManifestFile(item.path)) && (item.size === undefined || item.size <= MAX_FILE_BYTES)) {
        eligibleBlobs.push(item)
      }
    }

    const prioritized = prioritizeCandidateBlobs(eligibleBlobs).slice(0, limit)

    // Fetch in bounded concurrent batches of 15 to avoid socket/rate exhaustion
    const sampledFiles = []
    let totalBytesAccumulated = 0
    const batchSize = 15

    for (let i = 0; i < prioritized.length; i += batchSize) {
      if (totalBytesAccumulated >= MAX_TOTAL_ANALYZED_BYTES) break
      const batch = prioritized.slice(i, i + batchSize)
      const fetchedBatch = await Promise.all(batch.map(async (item) => {
        try {
          const text = await fetchBlobContent({
            owner,
            repository,
            branch,
            item,
            tokenForReq,
            isPrivate: Boolean(repoMeta.private),
          })
          if (!text) return null
          return { path: item.path, size: item.size || text.length, content: text }
        } catch {
          return null
        }
      }))

      for (const file of fetchedBatch) {
        if (!file) continue
        if (totalBytesAccumulated + file.content.length > MAX_TOTAL_ANALYZED_BYTES && sampledFiles.length > 0) {
          break
        }
        sampledFiles.push(file)
        totalBytesAccumulated += file.content.length
      }
    }

    const repoIndex = buildRepositoryIndex(sampledFiles)
    const samplingMeta = computeSamplingMetadata({
      analyzedFiles: sampledFiles,
      totalFiles,
      eligibleSourceFiles: eligibleBlobs.length,
      excludedCount,
      limit,
      policyFilesDiscovered,
      policyFilesInspected,
      policyInspectionComplete,
      commitSha,
      cacheHit: false,
    })

    const result = {
      repo: {
        owner,
        repository,
        url,
        description: repoMeta.description || '',
        stars: repoMeta.stargazers_count || 0,
        defaultBranch: branch,
        private: Boolean(repoMeta.private),
        commitSha,
      },
      files: sampledFiles,
      policyFiles: validPolicyFiles,
      repoIndex,
      structure: buildStructure(sampledFiles, repoIndex.projectInfo),
      truncated: eligibleBlobs.length > sampledFiles.length,
      metadata: samplingMeta,
      source: 'github-api',
      mode: 'live',
    }

    if (!isTesting) {
      repositoryCache.set(cacheKey, { timestamp: Date.now(), data: result })
      if (shaCacheKey) {
        shaCache.set(shaCacheKey, result)
      }
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

export function buildStructure(files, projectInfo = null) {
  const rootDirectories = [...new Set(files.map((file) => file.path.split('/')[0]).filter(Boolean))].slice(0, 12)
  const languages = {}
  for (const file of files) {
    const extension = file.path.split('.').pop()?.toLowerCase()
    const language = LANGUAGE_BY_EXTENSION[extension] || 'Other'
    languages[language] = (languages[language] || 0) + 1
  }
  const entryPoints = files
    .filter((file) => /(^|\/)(main|index|app|server|routes?)\.(?:js|jsx|ts|tsx|py|go|rs)$/i.test(file.path))
    .map((file) => file.path)
    .slice(0, 8)

  return {
    sampledFileCount: files.length,
    rootDirectories,
    languages: Object.entries(languages).sort(([, left], [, right]) => right - left).slice(0, 6),
    entryPoints,
    ...(projectInfo ? {
      frameworks: projectInfo.frameworks,
      dependencies: projectInfo.dependencies.slice(0, 25),
      packageManagers: projectInfo.packageManagers,
    } : {}),
  }
}
