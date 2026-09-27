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
    expect(result.validation.syntaxValidation).toBe('passed')
    expect(result.validation.staticValidation).toBe('passed')
    expect(result.validation.testFrameworkValidation).toBe('passed')
    expect(result.validation.tests).toBe('not_executed')
    expect(result.validation.build).toBe('not_executed')
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

  it('validates and approves valid Python refactor with unittest test suite', async () => {
    const files = [
      {
        path: 'src/calculator.py',
        content: `def add(a: int, b: int) -> int:
    return a + b
`,
      },
      {
        path: 'tests/test_calculator.py',
        content: `import unittest
from src.calculator import add

class TestCalculator(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(2, 3), 5)
`,
      },
    ]

    const baseFiles = [
      { path: 'setup.cfg', content: '[unittest]\ntest_runner = unittest\n' },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/calculator.py',
      refactoredTarget: 'from .calculator_module import add\n',
      baseFiles,
    })

    expect(result.status).toBe('verified')
    expect(result.state).toBe('PR_ELIGIBLE')
    expect(result.validation.safeToPropose).toBe(true)
    expect(result.validation.lint).toBe('passed')
    expect(result.validation.syntaxValidation).toBe('passed')
    expect(result.validation.testFrameworkValidation).toBe('passed')
    expect(result.validation.tests).toBe('not_executed')
  })

  it('detects AGENTS.md in policyFiles even when policyFiles is not part of baseFiles', async () => {
    const files = [
      {
        path: 'src/main.ts',
        content: 'export const main = () => 1;',
      },
    ]

    const baseFiles = [
      { path: 'src/main.ts', content: 'export const main = () => 1;' },
    ]

    const policyFiles = [
      { path: 'AGENTS.md', content: 'No automated pull requests or bot contributions allowed.' },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/main.ts',
      baseFiles,
      policyFiles,
    })

    expect(result.policy.isBlocked).toBe(true)
    expect(result.state).toBe('PR_BLOCKED')
    expect(result.policy.policyFile).toBe('AGENTS.md')
  })

  it('rejects Python refactor with invalid syntax in generated module', async () => {
    const files = [
      {
        path: 'src/module.py',
        content: `def invalid_syntax(:
    pass
`,
      },
    ]

    const result = await validateRefactor({ files })
    expect(result.status).toBe('validation_failed')
    expect(result.state).toBe('VALIDATION_FAILED')
    expect(result.validation.lint).toBe('failed')
    expect(result.logs.lint).toContain('Python syntax error')
  })

  it('rejects refactor when test framework is incompatible with repository (Vitest in Jest repo)', async () => {
    const files = [
      {
        path: 'src/helper.ts',
        content: 'export const helper = () => 42;',
      },
      {
        path: 'src/helper.test.ts',
        content: `import { describe, it, expect } from 'vitest';
import { helper } from './helper';

describe('helper', () => {
  it('returns 42', () => {
    expect(helper()).toBe(42);
  });
});
`,
      },
    ]

    const baseFiles = [
      { path: 'package.json', content: JSON.stringify({ devDependencies: { jest: '^29.0.0', '@types/jest': '^29.0.0' } }) },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/helper.ts',
      baseFiles,
    })

    expect(result.status).toBe('validation_failed')
    expect(result.validation.tests).toBe('failed')
    expect(result.logs.tests).toContain('Incompatible test framework')
  })

  it('rejects refactor with PR_BLOCKED when repository policy prohibits automated PRs', async () => {
    const files = [
      {
        path: 'src/valid.ts',
        content: 'export const foo = 1;',
      },
      {
        path: 'src/valid.test.ts',
        content: 'describe("foo", () => { it("works", () => { expect(1).toBe(1); }); });',
      },
    ]

    const baseFiles = [
      { path: 'AGENTS.md', content: 'No automated pull requests or robot contributions permitted.' },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/valid.ts',
      baseFiles,
    })

    expect(result.policy.isBlocked).toBe(true)
    expect(result.state).toBe('PR_BLOCKED')
    expect(result.validation.safeToPropose).toBe(false)
  })
})
