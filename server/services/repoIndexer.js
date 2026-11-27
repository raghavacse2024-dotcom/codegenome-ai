import ts from 'typescript'

/**
 * Directories and file patterns that are unnecessary for code intelligence
 * and should be excluded during repository indexing.
 */
export const EXCLUDED_DIR_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.venv',
  'venv',
  'env',
  'virtualenv',
  'target',
  'vendor',
  'Pods',
  'DerivedData',
  '.gradle',
  '.idea',
  '.vscode',
  'bin',
  'obj',
])

const EXCLUDED_FILE_PATTERNS = [
  /\.min\.(?:js|css)$/i,
  /\.bundle\.(?:js|css)$/i,
  /\.chunk\.(?:js|css)$/i,
  /\.map$/i,
  /\.d\.ts$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.yaml$/i,
  /bun\.lockb?$/i,
  /poetry\.lock$/i,
  /Cargo\.lock$/i,
  /go\.sum$/i,
  /composer\.lock$/i,
  /Gemfile\.lock$/i,
  /\.(?:png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|mp4|mp3|pdf|zip|tar|gz|wasm|exe|dll|so|dylib|pyc|pyo)$/i,
]

export const MANIFEST_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vitest.config.ts',
  'vitest.config.js',
  'jest.config.js',
  'jest.config.ts',
  'eslint.config.js',
  'eslint.config.mjs',
  '.eslintrc.json',
  'requirements.txt',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'pytest.ini',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
])

export const CODE_OR_CONFIG_EXTENSIONS = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|py|pyi|java|go|rb|php|cs|rs|vue|svelte|css|scss|html|sql|json|ya?ml|toml)$/i

/**
 * Checks if a repository path belongs to an excluded build, dependency, or generated artifact directory.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isExcludedRepoPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return true
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = normalized.split('/')
  // Check directory segments (all except final filename, or all segments)
  for (let i = 0; i < segments.length - 1; i++) {
    if (EXCLUDED_DIR_SEGMENTS.has(segments[i])) return true
  }
  const fileName = segments[segments.length - 1] || ''
  if (EXCLUDED_DIR_SEGMENTS.has(fileName)) return true
  return EXCLUDED_FILE_PATTERNS.some((pat) => pat.test(normalized))
}

/**
 * Checks if a file is a project manifest / dependency / build config file.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isManifestFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  const baseName = filePath.split('/').pop() || ''
  return MANIFEST_FILES.has(baseName)
}

/**
 * Extracts functions, classes, imports, exports, and line spans from a file.
 * @param {string} filePath
 * @param {string} content
 * @returns {Array<{ name: string, kind: string, startLine: number, endLine: number }>}
 */
export function extractFileSymbols(filePath, content) {
  if (!content || typeof content !== 'string') return []
  const symbols = []

  if (/\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/i.test(filePath)) {
    try {
      const isJsx = /\.(?:jsx|tsx)$/i.test(filePath)
      const scriptKind = filePath.endsWith('.tsx')
        ? ts.ScriptKind.TSX
        : filePath.endsWith('.ts')
        ? ts.ScriptKind.TS
        : isJsx
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS

      const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind)
      const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1

      function walk(node) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          symbols.push({
            name: node.name.text,
            kind: 'function',
            startLine: lineOf(node.getStart(sf)),
            endLine: lineOf(node.getEnd()),
          })
        } else if (ts.isClassDeclaration(node) && node.name) {
          symbols.push({
            name: node.name.text,
            kind: 'class',
            startLine: lineOf(node.getStart(sf)),
            endLine: lineOf(node.getEnd()),
          })
        } else if (ts.isMethodDeclaration(node) && node.name) {
          symbols.push({
            name: node.name.getText(sf),
            kind: 'method',
            startLine: lineOf(node.getStart(sf)),
            endLine: lineOf(node.getEnd()),
          })
        } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
          symbols.push({
            name: node.name.text,
            kind: ts.isInterfaceDeclaration(node) ? 'interface' : 'type',
            startLine: lineOf(node.getStart(sf)),
            endLine: lineOf(node.getEnd()),
          })
        } else if (ts.isVariableStatement(node)) {
          const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer) || isExported)) {
              symbols.push({
                name: decl.name.text,
                kind: ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer) ? 'function' : 'export',
                startLine: lineOf(node.getStart(sf)),
                endLine: lineOf(node.getEnd()),
              })
            }
          }
        }
        ts.forEachChild(node, walk)
      }
      walk(sf)
      return symbols.slice(0, 60)
    } catch {
      // Fall through to regex extraction
    }
  }

  // Regex fallback for Python, Go, Java, Rust, etc.
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const pyMatch = line.match(/^\s*(?:async\s+)?(def|class)\s+([a-zA-Z0-9_]+)/)
    if (pyMatch) {
      symbols.push({ name: pyMatch[2], kind: pyMatch[1] === 'class' ? 'class' : 'function', startLine: i + 1, endLine: i + 1 })
      continue
    }
    const goMatch = line.match(/^\s*func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/)
    if (goMatch) {
      symbols.push({ name: goMatch[1], kind: 'function', startLine: i + 1, endLine: i + 1 })
      continue
    }
    const rsMatch = line.match(/^\s*(?:pub\s+)?(?:async\s+)?(fn|struct|enum|trait)\s+([a-zA-Z0-9_]+)/)
    if (rsMatch) {
      symbols.push({ name: rsMatch[2], kind: rsMatch[1] === 'fn' ? 'function' : rsMatch[1], startLine: i + 1, endLine: i + 1 })
      continue
    }
    const javaMatch = line.match(/^\s*(?:public|private|protected)?\s*(?:static\s+)?(class|interface|enum)\s+([a-zA-Z0-9_]+)/)
    if (javaMatch) {
      symbols.push({ name: javaMatch[2], kind: javaMatch[1], startLine: i + 1, endLine: i + 1 })
    }
  }
  return symbols.slice(0, 60)
}

/**
 * Splits a file into overlapping, line-numbered code chunks for accurate AI agent grounding and Q&A retrieval.
 * @param {string} filePath
 * @param {string} content
 * @param {number} [chunkLines=80]
 * @param {number} [overlapLines=12]
 * @returns {Array<{ id: string, path: string, startLine: number, endLine: number, content: string, symbols: string[] }>}
 */
export function chunkFileContent(filePath, content, chunkLines = 80, overlapLines = 12) {
  if (!content || typeof content !== 'string') return []
  const lines = content.split(/\r?\n/)
  const symbols = extractFileSymbols(filePath, content)
  const chunks = []

  if (lines.length <= chunkLines) {
    chunks.push({
      id: `${filePath}:1-${lines.length}`,
      path: filePath,
      startLine: 1,
      endLine: lines.length,
      content,
      symbols: symbols.map((s) => `${s.kind}:${s.name}@L${s.startLine}`),
    })
    return chunks
  }

  const step = Math.max(10, chunkLines - overlapLines)
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + chunkLines)
    const startLine = start + 1
    const endLine = end
    const chunkSymbols = symbols
      .filter((s) => s.startLine >= startLine && s.startLine <= endLine)
      .map((s) => `${s.kind}:${s.name}@L${s.startLine}`)

    chunks.push({
      id: `${filePath}:${startLine}-${endLine}`,
      path: filePath,
      startLine,
      endLine,
      content: lines.slice(start, end).join('\n'),
      symbols: chunkSymbols,
    })

    if (end >= lines.length) break
  }

  return chunks
}

/**
 * Extracts dependencies, scripts, frameworks, and project metadata from manifest files.
 * @param {Array<{ path: string, content: string }>} files
 * @returns {{
 *   frameworks: string[],
 *   dependencies: Array<{ name: string, version: string, source: string }>,
 *   devDependencies: Array<{ name: string, version: string, source: string }>,
 *   scripts: Record<string, string>,
 *   packageManagers: string[],
 *   manifestsFound: string[],
 * }}
 */
export function extractProjectDependencies(files = []) {
  const frameworks = new Set()
  const dependenciesMap = new Map()
  const devDependenciesMap = new Map()
  const scripts = {}
  const packageManagers = new Set()
  const manifestsFound = []

  const addDep = (map, name, version, source) => {
    const key = `${source}:${name}`
    if (!map.has(key)) {
      map.set(key, { name, version: String(version || '*'), source })
    }
  }

  for (const file of files) {
    const baseName = file.path.split('/').pop() || ''
    if (!file.content) continue

    if (baseName === 'package.json') {
      manifestsFound.push(file.path)
      packageManagers.add('npm')
      try {
        const pkg = JSON.parse(file.content)
        const deps = pkg.dependencies || {}
        const devDeps = pkg.devDependencies || {}
        for (const [name, version] of Object.entries(deps)) addDep(dependenciesMap, name, version, file.path)
        for (const [name, version] of Object.entries(devDeps)) addDep(devDependenciesMap, name, version, file.path)
        if (file.path === 'package.json' && pkg.scripts && typeof pkg.scripts === 'object') {
          Object.assign(scripts, pkg.scripts)
        }
        const allDeps = { ...deps, ...devDeps }
        if (allDeps.next) frameworks.add('Next.js')
        if (allDeps.react) frameworks.add('React')
        if (allDeps.vue) frameworks.add('Vue')
        if (allDeps.svelte) frameworks.add('Svelte')
        if (allDeps.express) frameworks.add('Express')
        if (allDeps.fastify) frameworks.add('Fastify')
        if (allDeps['@nestjs/core']) frameworks.add('NestJS')
        if (allDeps.vite) frameworks.add('Vite')
        if (allDeps.vitest) frameworks.add('Vitest')
        if (allDeps.jest) frameworks.add('Jest')
        if (allDeps.tailwindcss) frameworks.add('Tailwind CSS')
        if (allDeps.typescript) frameworks.add('TypeScript')
      } catch {}
    } else if (baseName === 'requirements.txt') {
      manifestsFound.push(file.path)
      packageManagers.add('pip')
      for (const line of file.content.split(/\r?\n/)) {
        const clean = line.trim().split('#')[0].trim()
        if (!clean) continue
        const match = clean.match(/^([a-zA-Z0-9._-]+)(.*)$/)
        const pkgName = match?.[1]?.trim()
        const version = match?.[2]?.trim() || '*'
        if (pkgName) {
          addDep(dependenciesMap, pkgName, version, file.path)
          if (/django/i.test(pkgName)) frameworks.add('Django')
          if (/fastapi/i.test(pkgName)) frameworks.add('FastAPI')
          if (/flask/i.test(pkgName)) frameworks.add('Flask')
          if (/pytest/i.test(pkgName)) frameworks.add('Pytest')
        }
      }
    } else if (baseName === 'pyproject.toml') {
      manifestsFound.push(file.path)
      packageManagers.add('poetry/pip')
      if (/fastapi/i.test(file.content)) frameworks.add('FastAPI')
      if (/django/i.test(file.content)) frameworks.add('Django')
      if (/flask/i.test(file.content)) frameworks.add('Flask')
      if (/pytest/i.test(file.content)) frameworks.add('Pytest')
    } else if (baseName === 'go.mod') {
      manifestsFound.push(file.path)
      packageManagers.add('go modules')
      frameworks.add('Go')
      for (const line of file.content.split(/\r?\n/)) {
        const m = line.trim().match(/^([a-zA-Z0-9.-]+\/[^\s]+)\s+(v[^\s]+)/)
        if (m) addDep(dependenciesMap, m[1], m[2], file.path)
      }
    } else if (baseName === 'Cargo.toml') {
      manifestsFound.push(file.path)
      packageManagers.add('cargo')
      frameworks.add('Rust')
    } else if (baseName === 'pom.xml' || baseName === 'build.gradle') {
      manifestsFound.push(file.path)
      packageManagers.add(baseName === 'pom.xml' ? 'maven' : 'gradle')
      if (/spring-boot/i.test(file.content)) frameworks.add('Spring Boot')
    }
  }

  return {
    frameworks: Array.from(frameworks),
    dependencies: Array.from(dependenciesMap.values()).slice(0, 80),
    devDependencies: Array.from(devDependenciesMap.values()).slice(0, 80),
    scripts,
    packageManagers: Array.from(packageManagers),
    manifestsFound,
  }
}

/**
 * Builds a full searchable repository index with chunks, symbols, and dependency metadata.
 * @param {Array<{ path: string, content: string, size?: number }>} files
 * @returns {{
 *   files: Array<{ path: string, lines: number, symbols: Array<object> }>,
 *   chunks: Array<{ id: string, path: string, startLine: number, endLine: number, content: string, symbols: string[] }>,
 *   projectInfo: ReturnType<typeof extractProjectDependencies>,
 * }}
 */
export function buildRepositoryIndex(files = []) {
  const fileIndex = []
  const chunks = []

  for (const file of files) {
    if (!file?.path || typeof file.content !== 'string') continue
    const lines = file.content.split(/\r?\n/).length
    const symbols = extractFileSymbols(file.path, file.content)
    fileIndex.push({
      path: file.path,
      lines,
      symbols,
    })
    const fileChunks = chunkFileContent(file.path, file.content)
    chunks.push(...fileChunks)
  }

  const projectInfo = extractProjectDependencies(files)

  return {
    files: fileIndex,
    chunks,
    projectInfo,
  }
}
