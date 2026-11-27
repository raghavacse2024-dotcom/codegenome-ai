import { describe, expect, it } from 'vitest'
import {
  isExcludedRepoPath,
  extractProjectDependencies,
  chunkFileContent,
  buildRepositoryIndex,
} from '../server/services/repoIndexer.js'
import { retrieveRelevantCode } from '../server/services/codeRetriever.js'
import { answerQuestion } from '../server/routes/qa.js'

describe('Repository Indexing, Exclusion, Chunking & Code-Aware Retrieval', () => {
  it('excludes node_modules, dist, build, coverage, lockfiles, and binary artifacts', () => {
    expect(isExcludedRepoPath('node_modules/express/index.js')).toBe(true)
    expect(isExcludedRepoPath('frontend/dist/assets/index.js')).toBe(true)
    expect(isExcludedRepoPath('build/output.js')).toBe(true)
    expect(isExcludedRepoPath('.next/server/app.js')).toBe(true)
    expect(isExcludedRepoPath('package-lock.json')).toBe(true)
    expect(isExcludedRepoPath('src/bundle.min.js')).toBe(true)
    expect(isExcludedRepoPath('src/routes/auth.ts')).toBe(false)
  })

  it('extracts project dependencies and frameworks from package.json and requirements.txt', () => {
    const files = [
      {
        path: 'package.json',
        content: JSON.stringify({
          dependencies: { express: '^4.21.0', react: '^18.3.0' },
          devDependencies: { vitest: '^2.1.0', typescript: '^5.7.0' },
        }),
      },
      {
        path: 'requirements.txt',
        content: 'fastapi>=0.110.0\npytest==8.1.0\n',
      },
    ]

    const info = extractProjectDependencies(files)
    expect(info.packageManagers).toContain('npm')
    expect(info.packageManagers).toContain('pip')
    expect(info.frameworks).toEqual(expect.arrayContaining(['Express', 'React', 'Vitest', 'FastAPI', 'Pytest']))
    expect(info.dependencies.some((d) => d.name === 'express')).toBe(true)
    expect(info.dependencies.some((d) => d.name === 'fastapi')).toBe(true)
  })

  it('chunks files into line-numbered chunks with extracted symbols', () => {
    const lines = Array.from({ length: 130 }, (_, i) =>
      i === 5
        ? 'export function authenticateToken(token: string) {'
        : i === 12
        ? '  return Boolean(token); }'
        : i === 95
        ? 'export class SessionRegistry { clear() {} }'
        : `// line ${i + 1}`
    ).join('\n')

    const chunks = chunkFileContent('src/auth.ts', lines, 70, 10)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[0].symbols.some((s) => s.includes('authenticateToken'))).toBe(true)
    expect(chunks[1].symbols.some((s) => s.includes('SessionRegistry'))).toBe(true)
  })

  it('retrieves relevant code chunks and cites file paths + line numbers in Q&A', async () => {
    const files = [
      {
        path: 'server/authResolver.js',
        content: `export function verifySessionSignature(token) {\n  if (!token) return null;\n  return { verified: true, uid: 'user_1' };\n}\n`,
      },
      {
        path: 'server/billing.js',
        content: `export function calculateInvoice(items) {\n  return items.reduce((sum, x) => sum + x.price, 0);\n}\n`,
      },
    ]
    const repoIndex = buildRepositoryIndex(files)
    const analysis = {
      repo: { owner: 'org', repository: 'app', url: 'https://github.com/org/app', defaultBranch: 'main' },
      metadata: { completeness: 'complete' },
      files,
      repoIndex,
      results: {
        architecture: { data: { framework: 'Node.js', layers: ['api'], structure: { entryPoints: ['server/authResolver.js'] } } },
        debt: { data: { hotspots: [{ path: 'server/authResolver.js', score: 25, lines: 4 }], totalDebtScore: 25 } },
        cost: { data: { annualCost: 500, priority: 'Low', roiMonths: 1 } },
        refactor: { data: { target: 'server/authResolver.js', steps: ['Keep modular'] } },
      },
    }

    const { chunks } = retrieveRelevantCode(analysis, 'how does verifySessionSignature work?')
    expect(chunks[0].path).toBe('server/authResolver.js')
    expect(chunks[0].startLine).toBe(1)

    const qaResponse = await answerQuestion(analysis, 'Explain verifySessionSignature')
    expect(qaResponse.citations.length).toBeGreaterThan(0)
    expect(qaResponse.citations[0].filePath).toBe('server/authResolver.js')
    expect(qaResponse.answer).toContain('server/authResolver.js:L1-')
  })

  it('explicitly refuses to fabricate when repository evidence is insufficient', async () => {
    const analysis = {
      repo: { owner: 'org', repository: 'empty-app', url: 'https://github.com/org/empty-app' },
      files: [],
      results: {},
    }

    const qaResponse = await answerQuestion(analysis, 'How does payment webhook signature verification work?')
    expect(qaResponse.insufficientEvidence).toBe(true)
    expect(qaResponse.answer.toLowerCase()).toContain('insufficient evidence')
  })
})
