import { parseRepositoryUrl } from './contracts.js'
const MAX_FILES = 75, MAX_FILE_BYTES = 45_000
const CODE_EXTENSIONS = /\.(?:js|jsx|ts|tsx|py|java|go|rb|php|cs|rs|vue|svelte|css|html|sql)$/i
const LANGUAGE_BY_EXTENSION = { js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', java: 'Java', go: 'Go', rb: 'Ruby', php: 'PHP', cs: 'C#', rs: 'Rust', vue: 'Vue', svelte: 'Svelte', css: 'CSS', html: 'HTML', sql: 'SQL' }
const headers = () => ({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) })
async function githubFetch(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: headers(), signal: AbortSignal.timeout(15_000) })
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw Object.assign(new Error(response.status === 403 ? 'GitHub rate limit reached. Add GITHUB_TOKEN on Render or try later.' : (body.message || `GitHub returned ${response.status}`)), { status: response.status }) }
  return response.json()
}
export async function fetchRepository(repositoryUrl) {
  const { owner, repository, url } = parseRepositoryUrl(repositoryUrl)
  const metadata = await githubFetch(`/repos/${owner}/${repository}`), branch = metadata.default_branch
  const tree = await githubFetch(`/repos/${owner}/${repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
  const candidates = (tree.tree || []).filter((item) => item.type === 'blob' && CODE_EXTENSIONS.test(item.path) && item.size <= MAX_FILE_BYTES).slice(0, MAX_FILES)
  const files = await Promise.all(candidates.map(async (item) => { const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repository}/${branch}/${item.path}`, { signal: AbortSignal.timeout(10_000) }); return { path: item.path, size: item.size, content: raw.ok ? (await raw.text()).slice(0, MAX_FILE_BYTES) : '' } }))
  const sampledFiles = files.filter((file) => file.content)
  return { repo: { owner, repository, url, description: metadata.description || '', stars: metadata.stargazers_count || 0, defaultBranch: branch }, files: sampledFiles, structure: buildStructure(sampledFiles), truncated: (tree.tree || []).length > MAX_FILES }
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
