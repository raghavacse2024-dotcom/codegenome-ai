import { describe, expect, it } from 'vitest'
import { buildRefactorGitDiff, parseDiffHunks } from '../server/services/diffService.js'
import { createPullRequest } from '../server/services/prService.js'

describe('Git Diff Service', () => {
  it('generates structured diff with hunks, additions, and deletions', () => {
    const targetFile = {
      path: 'src/legacy.ts',
      content: 'export function legacyFunc() {\n  return 42;\n}\n',
    }
    const refactoredTarget =
      'import { helper } from "./features/helper"\n\nexport function legacyFunc() {\n  return helper();\n}\n'
    const scaffolds = [
      {
        path: 'src/features/helper.ts',
        content: 'export function helper() {\n  return 42;\n}\n',
      },
    ]

    const diff = buildRefactorGitDiff(targetFile, refactoredTarget, scaffolds)

    expect(diff).toBeDefined()
    expect(diff.summary.filesChanged).toBe(2)
    expect(diff.summary.additions).toBeGreaterThan(0)
    expect(diff.files).toHaveLength(2)

    // Check modified target
    const modified = diff.files.find((f) => f.path === 'src/legacy.ts')
    expect(modified).toBeDefined()
    expect(modified?.status).toBe('modified')
    expect(modified?.hunks.length).toBeGreaterThan(0)

    // Check added scaffold
    const added = diff.files.find((f) => f.path === 'src/features/helper.ts')
    expect(added).toBeDefined()
    expect(added?.status).toBe('added')
    expect(added?.deletions).toBe(0)
  })

  it('handles empty or missing target file gracefully', () => {
    const diff = buildRefactorGitDiff(null, '', [])
    expect(diff.summary.filesChanged).toBe(0)
    expect(diff.files).toEqual([])
    expect(diff.rawPatch).toBe('')
  })
})

describe('Automated PR Service', () => {
  it('falls back to simulated preview mode gracefully when token is mock or invalid', async () => {
    const targetFile = {
      path: 'src/legacy.ts',
      content: 'console.log("hello")\n',
    }
    const scaffolds = [
      { path: 'src/features/mod.ts', content: 'export const mod = 1;\n' }
    ]
    const diff = buildRefactorGitDiff(targetFile, 'console.log("world")\n', scaffolds)

    const result = await createPullRequest({
      owner: 'test-org',
      repository: 'demo-app',
      defaultBranch: 'main',
      token: 'mock-token',
      files: diff.files,
      patch: diff.rawPatch,
      title: 'refactor: decouple logic',
      branch: 'codegenome/test-branch',
    })

    expect(result.success).toBe(true)
    expect(result.mode).toBe('simulated')
    expect(result.branch).toBe('codegenome/test-branch')
    expect(result.cliCommand).toContain('git checkout -b codegenome/test-branch')
    expect(result.cliCommand).toContain('git apply')
  })
})
