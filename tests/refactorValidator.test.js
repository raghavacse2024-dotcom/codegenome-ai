import { describe, expect, it } from 'vitest'
import { validateRefactor } from '../server/services/refactorValidator.js'

describe('Refactor Validation Sandbox', () => {
  it('validates and approves safe, syntactically correct refactoring scaffolds with test suites', async () => {
    const files = [
      {
        path: 'src/features/calculator.ts',
        content: `export function add(a: number, b: number): number {
  return a + b;
}
`,
      },
      {
        path: 'src/features/calculator.test.ts',
        content: `import { describe, it, expect } from 'vitest';
import { add } from './calculator';

describe('calculator', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
`,
      },
    ]

    const result = await validateRefactor({ files })
    expect(result.status).toBe('verified')
    expect(result.validation.safeToPropose).toBe(true)
    expect(result.validation.lint).toBe('passed')
    expect(result.validation.typecheck).toBe('passed')
    expect(result.validation.build).toBe('passed')
    expect(result.validation.tests).toBe('passed')
    expect(result.failedStep).toBeNull()
  })

  it('rejects refactor with syntax errors during lint stage', async () => {
    const files = [
      {
        path: 'src/features/broken.ts',
        content: `export function brokenFunction( {
          const x = ; // syntax error
        `,
      },
    ]

    const result = await validateRefactor({ files })
    expect(result.status).toBe('validation_failed')
    expect(result.validation.safeToPropose).toBe(false)
    expect(result.validation.lint).toBe('failed')
    expect(result.failedStep).toBe('lint')
    expect(result.logs.lint).toContain('Syntax error')
  })

  it('rejects refactor when empty scaffold files are generated', async () => {
    const files = [
      {
        path: 'src/empty.ts',
        content: '   ',
      },
    ]

    const result = await validateRefactor({ files })
    expect(result.validation.safeToPropose).toBe(false)
    expect(result.validation.build).toBe('failed')
    expect(result.failedStep).toBe('build')
  })
})
