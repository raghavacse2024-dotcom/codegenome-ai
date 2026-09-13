import { describe, expect, it } from 'vitest'
import { analyzeFileAST, detectCircularDependencies } from '../server/services/astAnalyzer.js'

describe('AST Analyzer', () => {
  it('correctly calculates cyclomatic complexity and detects nesting', () => {
    const code = `
      export function processItems(items: any[], mode: string) {
        if (!items || items.length === 0) {
          return []
        }

        const results = []
        for (const item of items) {
          if (mode === 'fast') {
            if (item.valid) {
              results.push(item.id)
            }
          } else if (mode === 'deep') {
            switch (item.type) {
              case 'a':
                results.push(item.val * 2)
                break
              case 'b':
                results.push(item.val ? item.val : 0)
                break
              default:
                break
            }
          }
        }
        return results
      }
    `
    const metrics = analyzeFileAST('src/process.ts', code)

    expect(metrics.ast.functionCount).toBeGreaterThanOrEqual(1)
    expect(metrics.ast.cyclomaticComplexity).toBeGreaterThan(6)
    expect(metrics.ast.maxNestingDepth).toBeGreaterThanOrEqual(3)
    expect(metrics.score).toBeGreaterThan(15)
    expect(metrics.signals.some((s) => s.includes('cyclomatic complexity') || s.includes('nesting'))).toBe(true)
  })

  it('detects circular dependencies across modules', () => {
    const files = [
      {
        path: 'src/services/userService.ts',
        content: `import { getAuth } from '../auth/authManager'\nexport function getUser() { return getAuth() }`
      },
      {
        path: 'src/auth/authManager.ts',
        content: `import { getUser } from '../services/userService'\nexport function getAuth() { return getUser() }`
      },
      {
        path: 'src/utils/helpers.ts',
        content: `export function add(a: number, b: number) { return a + b }`
      }
    ]

    const cycles = detectCircularDependencies(files)
    expect(cycles.length).toBeGreaterThanOrEqual(1)
    expect(cycles[0].cycle).toContain('src/services/userService')
    expect(cycles[0].cycle).toContain('src/auth/authManager')
  })
})
