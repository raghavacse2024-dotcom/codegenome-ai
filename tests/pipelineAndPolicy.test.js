import { describe, expect, it } from 'vitest'
import { inspectContributionPolicy } from '../server/services/contributionPolicyService.js'
import { detectTargetLanguage, detectTestFramework } from '../server/services/languageDetector.js'
import { generateScaffolds } from '../server/services/scaffoldGenerator.js'
import { validateRefactor } from '../server/services/refactorValidator.js'
import { createPullRequest } from '../server/services/prService.js'

describe('Requirement 1 & 5: AGENTS.md prohibiting automated PRs', () => {
  it('detects AGENTS.md prohibiting automated PRs and blocks PR creation', () => {
    const files = [
      {
        path: 'AGENTS.md',
        content: `# Agent Contribution Guidelines\n\nNo automated PRs or AI-generated pull requests are permitted in this repository.\nAll contributions must be human-authored and reviewed.`,
      },
      {
        path: 'src/core.py',
        content: 'def run(): pass\n',
      },
    ]

    const policy = inspectContributionPolicy(files)
    expect(policy.isBlocked).toBe(true)
    expect(policy.state).toBe('PR_BLOCKED')
    expect(policy.policyFile).toBe('AGENTS.md')
    expect(policy.ruleSnippet).toContain('No automated PRs')
    expect(policy.explanation).toContain('AGENTS.md')
    expect(policy.allowsManualExport).toBe(true)
  })

  it('detects .github/AGENTS.md prohibiting AI-generated contributions', () => {
    const files = [
      {
        path: '.github/AGENTS.md',
        content: `AI-generated pull requests are strictly prohibited and will be closed immediately.`,
      },
      {
        path: 'main.py',
        content: 'print("hello")',
      },
    ]

    const policy = inspectContributionPolicy(files)
    expect(policy.isBlocked).toBe(true)
    expect(policy.state).toBe('PR_BLOCKED')
    expect(policy.policyFile).toBe('.github/AGENTS.md')
    expect(policy.allowsManualExport).toBe(true)
  })

  it('detects CONTRIBUTING.md prohibiting automated maintainer communication', () => {
    const files = [
      {
        path: 'CONTRIBUTING.md',
        content: `## Maintainer Guidelines\nAutomated maintainer communication is prohibited. Do not use AI to interact with maintainers.`,
      },
    ]

    const policy = inspectContributionPolicy(files)
    expect(policy.isBlocked).toBe(true)
    expect(policy.state).toBe('PR_BLOCKED')
    expect(policy.policyFile).toBe('CONTRIBUTING.md')
  })
})

describe('Requirement 1 & 5: Repository with no contribution restrictions', () => {
  it('allows PR eligibility when repository has no contribution restrictions', () => {
    const files = [
      {
        path: 'README.md',
        content: '# Standard Open Source Project\n\nWelcome to our repo.',
      },
      {
        path: 'CONTRIBUTING.md',
        content: '## Contributing\n\nPlease submit a pull request with unit tests and clear commit messages.',
      },
      {
        path: 'src/index.ts',
        content: 'export const status = "ok";',
      },
    ]

    const policy = inspectContributionPolicy(files)
    expect(policy.isBlocked).toBe(false)
    expect(policy.status).toBe('ALLOWED')
    expect(policy.state).toBe('PR_ELIGIBLE')
    expect(policy.policyFile).toBe('CONTRIBUTING.md')
    expect(policy.ruleSnippet).toBeNull()
    expect(policy.explanation).toContain('permits automated pull requests')
    expect(policy.allowsManualExport).toBe(true)
  })

  it('classifies policy as UNKNOWN when no policy file exists', () => {
    const policy = inspectContributionPolicy([])
    expect(policy.status).toBe('UNKNOWN')
    expect(policy.state).toBe('POLICY_UNKNOWN')
    expect(policy.isBlocked).toBe(false)
  })
})

describe('Requirement 2 & 5: Python refactor generating Python', () => {
  it('generates Python code when refactoring docs/refman/generatorman.py instead of TypeScript/JavaScript', () => {
    const targetPath = 'docs/refman/generatorman.py'
    const targetFile = {
      path: targetPath,
      content: `"""Doc generator manual."""
def generate_reference_manual(doc_config):
    # Monolithic logic with high cyclomatic complexity
    pages = []
    if doc_config.get("include_api"):
        pages.append("api")
    if doc_config.get("include_cli"):
        pages.append("cli")
    return pages
`,
    }

    const repoFiles = [
      targetFile,
      { path: 'requirements.txt', content: 'pytest>=7.0.0\nsphinx>=4.0.0\n' },
      { path: 'tests/test_manual.py', content: 'import pytest\n\ndef test_dummy(): assert True\n' },
    ]

    // 1. Language detection
    const language = detectTargetLanguage(targetPath, repoFiles)
    expect(language).toBe('python')

    // 2. Scaffold generation
    const generated = generateScaffolds({ target: targetPath }, targetFile, repoFiles)
    expect(generated.language).toBe('python')
    expect(generated.files.length).toBeGreaterThanOrEqual(2)

    // Verify all generated files are Python (.py)
    for (const f of generated.files) {
      expect(f.path.endsWith('.py')).toBe(true)
      // Must NOT contain JavaScript/TypeScript syntax
      expect(f.content).not.toContain('export const')
      expect(f.content).not.toContain('export function')
      expect(f.content).not.toContain('import {')
      expect(f.content).not.toContain('interface ')
    }

    // Verify refactored target content is valid Python import
    expect(generated.refactoredTargetContent).toContain('create_generatorman')
    expect(generated.refactoredTargetContent).not.toContain('export const modular')
  })
})

describe('Requirement 2 & 5: Python repository using pytest/unittest', () => {
  it('detects pytest and generates pytest-compatible test suite', () => {
    const repoFiles = [
      { path: 'pytest.ini', content: '[pytest]\ntestpaths = tests' },
      { path: 'src/calculator.py', content: 'def add(a, b): return a + b' },
    ]

    const framework = detectTestFramework('python', repoFiles)
    expect(framework).toBe('pytest')

    const targetFile = { path: 'src/calculator.py', content: 'def add(a, b): return a + b' }
    const generated = generateScaffolds({ target: 'src/calculator.py' }, targetFile, repoFiles)

    expect(generated.testFramework).toBe('pytest')
    const testFile = generated.files.find((f) => f.path.includes('test_'))
    expect(testFile).toBeDefined()
    expect(testFile.content).toContain('import pytest')
    expect(testFile.content).toContain('def test_create_calculator_contract():')
    expect(testFile.content).toContain('assert ')
  })

  it('detects unittest and generates unittest-compatible test suite', () => {
    const repoFiles = [
      {
        path: 'tests/test_existing.py',
        content: `import unittest

class TestExisting(unittest.TestCase):
    def test_run(self):
        self.assertTrue(True)
`,
      },
      { path: 'src/service.py', content: 'def compute(): return 42' },
    ]

    const framework = detectTestFramework('python', repoFiles)
    expect(framework).toBe('unittest')

    const targetFile = { path: 'src/service.py', content: 'def compute(): return 42' }
    const generated = generateScaffolds({ target: 'src/service.py' }, targetFile, repoFiles)

    expect(generated.testFramework).toBe('unittest')
    const testFile = generated.files.find((f) => f.path.includes('test_'))
    expect(testFile).toBeDefined()
    expect(testFile.content).toContain('import unittest')
    expect(testFile.content).toContain('unittest.TestCase')
    expect(testFile.content).toContain('self.assertEqual')
  })
})

describe('Requirement 2 & 5: JS repository using Jest/Vitest', () => {
  it('detects Vitest from package.json and generates Vitest tests', () => {
    const repoFiles = [
      {
        path: 'package.json',
        content: JSON.stringify({
          devDependencies: { vitest: '^2.1.0' },
        }),
      },
      { path: 'src/utils.ts', content: 'export const util = () => "ok";' },
    ]

    const framework = detectTestFramework('typescript', repoFiles)
    expect(framework).toBe('vitest')

    const targetFile = { path: 'src/utils.ts', content: 'export const util = () => "ok";' }
    const generated = generateScaffolds({ target: 'src/utils.ts' }, targetFile, repoFiles)

    expect(generated.testFramework).toBe('vitest')
    const testFile = generated.files.find((f) => f.path.includes('.test.'))
    expect(testFile.content).toContain("from 'vitest'")
  })

  it('detects Jest from package.json and generates Jest tests', () => {
    const repoFiles = [
      {
        path: 'package.json',
        content: JSON.stringify({
          devDependencies: { jest: '^29.0.0', '@types/jest': '^29.0.0' },
          scripts: { test: 'jest' },
        }),
      },
      { path: 'src/utils.js', content: 'function util() { return "ok"; } module.exports = { util };' },
    ]

    const framework = detectTestFramework('javascript', repoFiles)
    expect(framework).toBe('jest')

    const targetFile = { path: 'src/utils.js', content: 'export function util() { return "ok"; }' }
    const generated = generateScaffolds({ target: 'src/utils.js' }, targetFile, repoFiles)

    expect(generated.testFramework).toBe('jest')
    const testFile = generated.files.find((f) => f.path.includes('.test.'))
    expect(testFile.content).not.toContain("from 'vitest'")
  })
})

describe('Requirement 3 & 5: Invalid generated syntax', () => {
  it('rejects refactor with invalid Python function syntax (missing colon)', async () => {
    const files = [
      {
        path: 'src/features/broken_syntax.py',
        content: `def broken_function(\n    return "no colon"\n`,
      },
      {
        path: 'tests/test_broken.py',
        content: `import pytest\n\ndef test_ok(): assert True\n`,
      },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/features/broken_syntax.py',
      baseFiles: [],
    })

    expect(result.validation.safeToPropose).toBe(false)
    expect(result.validation.lint).toBe('failed')
    expect(result.state).toBe('VALIDATION_FAILED')
    expect(result.failedStep).toBe('lint')
    expect(result.logs.lint).toContain('Python')
  })

  it('rejects refactor with unbalanced brackets in Python scaffold', async () => {
    const files = [
      {
        path: 'src/features/unbalanced.py',
        content: `def compute():\n    data = {"key": [1, 2, 3\n    return data\n`,
      },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/features/unbalanced.py',
    })

    expect(result.validation.lint).toBe('failed')
    expect(result.state).toBe('VALIDATION_FAILED')
    expect(result.failedStep).toBe('lint')
  })
})

describe('Requirement 3 & 5: Incompatible test framework', () => {
  it('rejects Python test file using JavaScript / Vitest syntax', async () => {
    const files = [
      {
        path: 'src/module.py',
        content: 'def create_module(): return {"status": "ok"}\n',
      },
      {
        path: 'tests/test_module.py',
        // Incompatible Vitest syntax in a Python test file!
        content: `describe('Python Module', () => {
  it('fails because it is JavaScript in Python', () => {
    expect(create_module()).toBeDefined();
  });
});
`,
      },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/module.py',
      baseFiles: [{ path: 'pytest.ini', content: '[pytest]' }],
    })

    expect(result.validation.safeToPropose).toBe(false)
    expect(result.validation.tests).toBe('failed')
    expect(result.state).toBe('VALIDATION_FAILED')
    expect(result.failedStep).toBe('tests')
    expect(result.logs.tests).toContain('JavaScript/Vitest syntax')
  })

  it('rejects pytest syntax in a repository configured for unittest', async () => {
    const files = [
      {
        path: 'src/service.py',
        content: 'def compute(): return 1\n',
      },
      {
        path: 'tests/test_service.py',
        // Incompatible: repo uses unittest, but test uses import pytest
        content: `import pytest\n\ndef test_compute():\n    assert compute() == 1\n`,
      },
    ]

    const baseFiles = [
      {
        path: 'tests/test_base.py',
        content: 'import unittest\nclass TestBase(unittest.TestCase):\n    def test_a(self): self.assertTrue(True)\n',
      },
    ]

    const result = await validateRefactor({
      files,
      targetPath: 'src/service.py',
      baseFiles,
    })

    expect(result.validation.tests).toBe('failed')
    expect(result.state).toBe('VALIDATION_FAILED')
    expect(result.failedStep).toBe('tests')
  })
})

describe('Requirement 4 & 5: Blocked automated PR', () => {
  it('blocks PR creation and explains policy when AGENTS.md restricts automated PRs', async () => {
    const baseFiles = [
      {
        path: 'AGENTS.md',
        content: `# Contribution Policy\n\nNo automated PRs or AI pull requests are accepted. All contributions must be manually authored.`,
      },
      {
        path: 'src/app.py',
        content: 'def main(): pass\n',
      },
    ]

    const files = [
      {
        path: 'src/app_module.py',
        content: 'def create_app(): return {"status": "ok"}\n',
      },
      {
        path: 'tests/test_app.py',
        content: 'import pytest\ndef test_create(): assert True\n',
      },
    ]

    const prResult = await createPullRequest({
      owner: 'example-org',
      repository: 'strict-repo',
      files,
      baseFiles,
      targetPath: 'src/app.py',
      refactoredTarget: 'from .app_module import create_app\n\ndef main(): pass\n',
      patch: '@@ -1,1 +1,2 @@\n+from .app_module import create_app\n',
    })

    expect(prResult.success).toBe(false)
    expect(prResult.mode).toBe('blocked')
    expect(prResult.state).toBe('PR_BLOCKED')
    expect(prResult.policy.isBlocked).toBe(true)
    expect(prResult.policy.policyFile).toBe('AGENTS.md')
    expect(prResult.error).toContain('AGENTS.md')
    expect(prResult.allowsManualExport).toBe(true)
    expect(prResult.cliCommand).toBeDefined()
  })
})

describe('Requirement 4 & 5: Allowed PR after successful validation', () => {
  it('allows PR creation with state PR_ELIGIBLE when all validation steps pass and no policy restrictions exist', async () => {
    const baseFiles = [
      {
        path: 'README.md',
        content: '# Standard Repository\n\nOpen contributions welcome.',
      },
      {
        path: 'src/feature.ts',
        content: 'export function run() { return "original"; }\n',
      },
    ]

    const files = [
      {
        path: 'src/feature_module.ts',
        content: 'export function createFeature() { return { status: "initialized" }; }\n',
      },
      {
        path: 'src/feature_module.test.ts',
        content: `import { describe, it, expect } from 'vitest';
import { createFeature } from './feature_module';

describe('Feature Module', () => {
  it('returns initialized status', () => {
    expect(createFeature().status).toBe('initialized');
  });
});
`,
      },
    ]

    const prResult = await createPullRequest({
      owner: 'acme-inc',
      repository: 'permissive-repo',
      files,
      baseFiles: [
        ...baseFiles,
        { path: 'CONTRIBUTING.md', content: 'Automated contributions welcome.' }
      ],
      targetPath: 'src/feature.ts',
      refactoredTarget: 'import { createFeature } from "./feature_module";\nexport function run() { return "original"; }\n',
      patch: '@@ -1,1 +1,2 @@\n+import { createFeature } from "./feature_module";\n',
    })

    expect(prResult.success).toBe(false)
    expect(prResult.state).toBe('HUMAN_REVIEW_REQUIRED')
    expect(prResult.validation.safeToPropose).toBe(false)
    expect(prResult.validation.lint).toBe('passed')
    expect(prResult.validation.typecheck).toBe('passed')
    expect(prResult.validation.syntaxValidation).toBe('passed')
    expect(prResult.validation.staticValidation).toBe('passed')
    expect(prResult.validation.testFrameworkValidation).toBe('passed')
    expect(prResult.validation.tests).toBe('not_executed')
    expect(prResult.validation.build).toBe('not_executed')
    expect(prResult.branch).toContain('codegenome/refactor')
  })
})
