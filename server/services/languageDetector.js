/**
 * Language, Framework, and Test-Framework Detection Service for CodeGenome AI.
 * Analyzes target source files and repository configuration to detect target language,
 * build tools, and existing test frameworks before generating refactor proposals.
 */

export const SUPPORTED_LANGUAGES = {
  python: {
    id: 'python',
    name: 'Python',
    extensions: ['.py', '.pyi', '.pyw'],
    defaultTestFramework: 'pytest',
    testFilePattern: /(?:test_.*\.py|.*_test\.py)$/i,
  },
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    defaultTestFramework: 'vitest',
    testFilePattern: /\.(?:test|spec)\.(?:ts|tsx)$/i,
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    defaultTestFramework: 'jest',
    testFilePattern: /\.(?:test|spec)\.(?:js|jsx)$/i,
  },
  java: {
    id: 'java',
    name: 'Java',
    extensions: ['.java'],
    defaultTestFramework: 'junit5',
    testFilePattern: /.*(?:Test|Tests|TestCase)\.java$/i,
  },
  go: {
    id: 'go',
    name: 'Go',
    extensions: ['.go'],
    defaultTestFramework: 'go-test',
    testFilePattern: /.*_test\.go$/i,
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    extensions: ['.rs'],
    defaultTestFramework: 'cargo-test',
    testFilePattern: /(?:.*_test\.rs|tests\/.*\.rs)$/i,
  },
}

/**
 * Detects the target programming language from the file path and repository context.
 *
 * @param {string} targetPath File path to inspect (e.g. docs/refman/generatorman.py)
 * @param {Array<{ path: string, content?: string }>} [files=[]] Repository files
 * @returns {string} Language key ('python' | 'typescript' | 'javascript' | 'java' | 'go' | 'rust')
 */
export function detectTargetLanguage(targetPath = '', files = []) {
  if (!targetPath) return 'typescript'

  const ext = (targetPath.split('.').pop() || '').toLowerCase()

  switch (ext) {
    case 'py':
    case 'pyi':
    case 'pyw':
      return 'python'
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'java':
      return 'java'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    default: {
      // Check repository distribution if file has uncommon extension or no extension
      let pyCount = 0
      let tsCount = 0
      let jsCount = 0
      for (const f of files) {
        if (/\.py$/i.test(f.path)) pyCount++
        else if (/\.tsx?$/i.test(f.path)) tsCount++
        else if (/\.jsx?$/i.test(f.path)) jsCount++
      }
      if (pyCount > tsCount && pyCount > jsCount) return 'python'
      if (jsCount > tsCount && jsCount > pyCount) return 'javascript'
      return 'typescript'
    }
  }
}

/**
 * Detects the repository's test framework for the specified language.
 *
 * @param {string} language Detected language ('python' | 'typescript' | 'javascript' | 'java' | 'go' | 'rust')
 * @param {Array<{ path: string, content?: string }>} [files=[]] Repository files
 * @returns {string} Test framework ('pytest' | 'unittest' | 'vitest' | 'jest' | 'mocha' | 'junit5' | 'junit4' | 'go-test' | 'cargo-test')
 */
export function detectTestFramework(language, files = []) {
  if (language === 'python') {
    // Check python configuration files and imports
    for (const f of files) {
      const lowerPath = f.path.toLowerCase()
      if (lowerPath === 'pytest.ini' || lowerPath === 'conftest.py' || lowerPath.endsWith('/conftest.py')) {
        return 'pytest'
      }
      if (lowerPath === 'pyproject.toml' || lowerPath === 'setup.cfg' || lowerPath === 'tox.ini') {
        if (f.content && /\[(?:tool\.)?pytest/i.test(f.content)) {
          return 'pytest'
        }
        if (f.content && /(?:unittest|test_suite\s*=\s*['"]unittest)/i.test(f.content)) {
          return 'unittest'
        }
      }
      if (lowerPath === 'requirements.txt' || lowerPath === 'pipfile') {
        if (f.content && /pytest/i.test(f.content)) {
          return 'pytest'
        }
      }
      if (lowerPath === 'setup.py' && f.content && /test_suite\s*=\s*['"]unittest/i.test(f.content)) {
        return 'unittest'
      }
    }

    // Inspect existing test file contents
    const pythonTestFiles = files.filter((f) => /(?:test_.*\.py|.*_test\.py)$/i.test(f.path))
    let pytestSignal = 0
    let unittestSignal = 0

    for (const tf of pythonTestFiles) {
      if (tf.content) {
        if (/import\s+pytest|@pytest\.mark/i.test(tf.content)) {
          pytestSignal++
        }
        if (/import\s+unittest|unittest\.TestCase|self\.assert/i.test(tf.content)) {
          unittestSignal++
        }
      }
    }

    if (unittestSignal > 0 && pytestSignal === 0) return 'unittest'
    if (pytestSignal > 0) return 'pytest'
    if (unittestSignal > 0) return 'unittest'

    // Default for Python repositories: pytest
    return 'pytest'
  }

  if (language === 'typescript' || language === 'javascript') {
    const pkgJson = files.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'))
    if (pkgJson?.content) {
      try {
        const pkg = JSON.parse(pkgJson.content)
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }
        if (deps.vitest) return 'vitest'
        if (deps.jest || deps['@types/jest'] || deps['ts-jest'] || deps['react-scripts']) return 'jest'
        if (deps.mocha) return 'mocha'

        // Check package.json test scripts
        if (pkg.scripts?.test) {
          if (/\bvitest\b/.test(pkg.scripts.test)) return 'vitest'
          if (/\bjest\b/.test(pkg.scripts.test)) return 'jest'
          if (/\bmocha\b/.test(pkg.scripts.test)) return 'mocha'
        }
      } catch {}
    }

    // Check config files
    if (files.some((f) => /vitest\.config\.[jt]s$/i.test(f.path))) return 'vitest'
    if (files.some((f) => /jest\.config\.[jt]s$/i.test(f.path))) return 'jest'

    return language === 'typescript' ? 'vitest' : 'jest'
  }

  if (language === 'java') {
    for (const f of files) {
      if (/pom\.xml|build\.gradle/i.test(f.path) && f.content) {
        if (/junit-jupiter|org\.junit\.jupiter/i.test(f.content)) return 'junit5'
        if (/junit:junit:4|org\.junit\.Test/i.test(f.content)) return 'junit4'
        if (/testng/i.test(f.content)) return 'testng'
      }
    }
    return 'junit5'
  }

  if (language === 'go') {
    return 'go-test'
  }

  if (language === 'rust') {
    return 'cargo-test'
  }

  return 'generic'
}

/**
 * Returns full language and test-framework profile for a target file.
 *
 * @param {string} targetPath Target hotspot path
 * @param {Array<{ path: string, content?: string }>} [files=[]]
 */
export function analyzeLanguageEnvironment(targetPath, files = []) {
  const language = detectTargetLanguage(targetPath, files)
  const testFramework = detectTestFramework(language, files)

  return {
    language,
    testFramework,
    languageMeta: SUPPORTED_LANGUAGES[language] || {
      id: language,
      name: language.toUpperCase(),
      extensions: [],
      defaultTestFramework: 'generic',
    },
  }
}
