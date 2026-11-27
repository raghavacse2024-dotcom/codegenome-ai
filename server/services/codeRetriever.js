import { buildRepositoryIndex, chunkFileContent } from './repoIndexer.js'
import { redactSecrets } from './secretRedactor.js'

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'which', 'where', 'when', 'how', 'why',
  'this', 'that', 'these', 'those', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by',
  'about', 'does', 'do', 'did', 'can', 'could', 'would', 'should', 'will', 'have', 'has', 'had',
  'and', 'or', 'not', 'but', 'if', 'then', 'else', 'my', 'your', 'our', 'their', 'it', 'its',
  'repo', 'repository', 'code', 'codebase', 'file', 'files', 'explain', 'tell', 'me', 'show',
])

/**
 * Tokenizes text into normalized search terms (splitting camelCase, snake_case, and paths).
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeQuery(text) {
  if (!text || typeof text !== 'string') return []
  const expanded = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[/_.\-:()[\]{}'"`<>]/g, ' ')
    .toLowerCase()

  return expanded
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
}

/**
 * Retrieves the most relevant code chunks for a query from an indexed repository or raw files.
 * @param {object} analysis Stored analysis object (with repoIndex, files, hotspots, etc.)
 * @param {string} query User question or agent focus topic
 * @param {{ maxChunks?: number, maxChars?: number }} [options]
 * @returns {{
 *   chunks: Array<{ path: string, startLine: number, endLine: number, content: string, score: number, symbols: string[] }>,
 *   indexedFileCount: number,
 *   indexedFilesList: string[],
 *   hasSourceFiles: boolean,
 * }}
 */
export function retrieveRelevantCode(analysis, query, options = {}) {
  const maxChunks = options.maxChunks ?? 8
  const maxChars = options.maxChars ?? 14_000

  let chunks = analysis?.repoIndex?.chunks
  let indexedFilesList = analysis?.repoIndex?.files?.map((f) => f.path) || []

  if ((!chunks || chunks.length === 0) && Array.isArray(analysis?.files) && analysis.files.length > 0) {
    const built = buildRepositoryIndex(analysis.files)
    chunks = built.chunks
    indexedFilesList = built.files.map((f) => f.path)
  } else if ((!chunks || chunks.length === 0) && Array.isArray(analysis?.results?.refactor?.data?.scaffolds)) {
    const fallbackFiles = analysis.results.refactor.data.scaffolds
    chunks = fallbackFiles.flatMap((f) => chunkFileContent(f.path, f.content || ''))
    indexedFilesList = fallbackFiles.map((f) => f.path)
  }

  if (!chunks || chunks.length === 0) {
    return {
      chunks: [],
      indexedFileCount: indexedFilesList.length,
      indexedFilesList,
      hasSourceFiles: false,
    }
  }

  const terms = tokenizeQuery(query)
  const rawLower = String(query || '').toLowerCase()
  const hotspotPaths = new Set((analysis?.results?.debt?.data?.hotspots || []).map((h) => h.path))
  const entryPoints = new Set(analysis?.results?.architecture?.data?.structure?.entryPoints || [])

  const scored = chunks.map((chunk) => {
    let score = 0
    const pathLower = chunk.path.toLowerCase()
    const contentLower = chunk.content.toLowerCase()
    const symbolsLower = (chunk.symbols || []).join(' ').toLowerCase()

    // Direct file path mention in query
    if (rawLower.includes(pathLower) || rawLower.includes(pathLower.split('/').pop() || '')) {
      score += 40
    }

    for (const term of terms) {
      if (pathLower.includes(term)) score += 12
      if (symbolsLower.includes(term)) score += 10
      // Count up to 5 occurrences in chunk content
      let idx = contentLower.indexOf(term)
      let hits = 0
      while (idx !== -1 && hits < 5) {
        hits++
        idx = contentLower.indexOf(term, idx + term.length)
      }
      score += hits * 3
    }

    // Slight boost for hotspots and entry points on broad architectural questions
    if (terms.length <= 2 || /architect|entry|main|debt|hotspot|refactor|overview|about|summary/i.test(rawLower)) {
      if (hotspotPaths.has(chunk.path)) score += 4
      if (entryPoints.has(chunk.path)) score += 4
      if (/(?:package\.json|README\.md)/i.test(chunk.path)) score += 3
    }

    return { ...chunk, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // If no terms matched strongly, still include top entry/manifest/hotspot chunks so general overview questions are grounded
  const selected = []
  let totalChars = 0
  const perFileCount = new Map()

  for (const item of scored) {
    if (selected.length >= maxChunks) break
    const fileHits = perFileCount.get(item.path) || 0
    if (fileHits >= 2) continue // ensure diversity across files
    const safeContent = redactSecrets(item.content)
    if (totalChars + safeContent.length > maxChars && selected.length > 0) continue

    selected.push({
      path: item.path,
      startLine: item.startLine,
      endLine: item.endLine,
      content: safeContent,
      score: item.score,
      symbols: item.symbols || [],
    })
    totalChars += safeContent.length
    perFileCount.set(item.path, fileHits + 1)
  }

  return {
    chunks: selected,
    indexedFileCount: indexedFilesList.length,
    indexedFilesList,
    hasSourceFiles: true,
  }
}

/**
 * Formats retrieved code chunks with exact file paths, line ranges, and symbols for LLM grounding.
 * @param {Array<{ path: string, startLine: number, endLine: number, content: string, symbols?: string[] }>} chunks
 * @returns {string}
 */
export function formatSnippetsForPrompt(chunks = []) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return '(No matching source code chunks retrieved from the indexed repository.)'
  }
  return chunks
    .map((c) => {
      const sym = c.symbols?.length ? ` [symbols: ${c.symbols.join(', ')}]` : ''
      return `--- ${c.path}:L${c.startLine}-${c.endLine}${sym} ---\n${c.content}`
    })
    .join('\n\n')
}
