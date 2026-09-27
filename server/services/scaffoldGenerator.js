import { buildRefactorGitDiff } from './diffService.js'
import { analyzeLanguageEnvironment } from './languageDetector.js'

/**
 * Converts a refactor plan into concrete language-aware scaffold files,
 * along with compatible test suites and Git Diff against the target hotspot file.
 *
 * @param {{ target?: string, scaffolds?: Array<{path: string, content: string}> }} refactorPlan Planner output.
 * @param {{ path: string, content?: string }|null} [targetFile=null] Original hotspot source file.
 * @param {Array<{ path: string, content?: string }>} [allFiles=[]] Repository files for context.
 * @returns {{
 *   files: Array<{path: string, content: string}>,
 *   refactoredTargetContent: string,
 *   diff: object,
 *   language: string,
 *   testFramework: string,
 * }} Generated scaffold bundle and git diff.
 */
export function generateScaffolds(refactorPlan, targetFile = null, allFiles = []) {
  const targetPath = refactorPlan?.target || targetFile?.path || 'src/features/feature.ts'
  const { language, testFramework } = analyzeLanguageEnvironment(targetPath, allFiles)

  const targetDir = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : ''
  const baseName = targetPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'feature'
  const safeName = baseName.replace(/[^\w]/g, '_').toLowerCase() || 'feature'
  const pascalName = safeName
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || 'Feature'

  let files = []

  // If plan already provides scaffolds, check if they match the target language
  if (Array.isArray(refactorPlan?.scaffolds) && refactorPlan.scaffolds.length > 0) {
    const isLangMatch = refactorPlan.scaffolds.every((f) => {
      if (language === 'python') return /\.py$/i.test(f.path)
      if (language === 'go') return /\.go$/i.test(f.path)
      if (language === 'java') return /\.java$/i.test(f.path)
      if (language === 'rust') return /\.rs$/i.test(f.path)
      if (language === 'javascript') return /\.jsx?$/i.test(f.path)
      if (language === 'typescript') return /\.tsx?$/i.test(f.path)
      return true
    })
    if (isLangMatch) {
      files = [...refactorPlan.scaffolds]
    }
  }

  // If no language-compatible scaffolds present, generate tailored templates
  if (files.length === 0) {
    files = generateLanguageScaffolds({
      language,
      testFramework,
      targetDir,
      safeName,
      pascalName,
      allFiles,
    })
  }

  // Generate refactored target content
  let refactoredTargetContent = ''
  if (targetFile?.content) {
    refactoredTargetContent = generateRefactoredTarget({
      language,
      targetFile,
      safeName,
      pascalName,
      targetDir,
    })
  }

  const diff = buildRefactorGitDiff(targetFile, refactoredTargetContent, files)

  return {
    files,
    refactoredTargetContent,
    diff,
    language,
    testFramework,
  }
}

/**
 * Generates tailored scaffold and test file pairs according to target programming language.
 */
function generateLanguageScaffolds({ language, testFramework, targetDir, safeName, pascalName, allFiles }) {
  const prefix = targetDir ? `${targetDir}/` : ''

  switch (language) {
    case 'python': {
      const scaffoldPath = `${prefix}${safeName}_module.py`
      const testDir = allFiles.some((f) => f.path.startsWith('tests/')) ? 'tests' : (targetDir || 'tests')
      const testPath = `${testDir}/test_${safeName}.py`

      const scaffoldContent = `"""
CodeGenome AI Refactor: Decoupled modular logic.
"""
from typing import Dict, Any, Optional


def create_${safeName}(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Modular extraction to decouple cyclomatic complexity from ${safeName}.
    """
    payload = config.copy() if config else {}
    payload.setdefault("status", "initialized")
    payload.setdefault("module", "${safeName}")
    return payload
`

      let testContent = ''
      if (testFramework === 'unittest') {
        testContent = `import unittest
from ${targetDir ? targetDir.replace(/\//g, '.') + '.' : ''}${safeName}_module import create_${safeName}


class Test${pascalName}(unittest.TestCase):
    def test_create_${safeName}_contract(self):
        result = create_${safeName}({"test": True})
        self.assertTrue(result["test"])
        self.assertEqual(result["status"], "initialized")


if __name__ == '__main__':
    unittest.main()
`
      } else {
        // Default pytest
        testContent = `import pytest
from ${targetDir ? targetDir.replace(/\//g, '.') + '.' : ''}${safeName}_module import create_${safeName}


def test_create_${safeName}_contract():
    result = create_${safeName}({"test": True})
    assert result["test"] is True
    assert result["status"] == "initialized"
    assert result["module"] == "${safeName}"
`
      }

      return [
        { path: scaffoldPath, content: scaffoldContent },
        { path: testPath, content: testContent },
      ]
    }

    case 'javascript': {
      const scaffoldPath = targetDir ? `${targetDir}/${safeName}.js` : `src/features/${safeName}/${safeName}.js`
      const testPath = targetDir ? `${targetDir}/${safeName}.test.js` : `src/features/${safeName}/${safeName}.test.js`

      const scaffoldContent = `/**
 * CodeGenome AI Refactor: Decoupled modular logic.
 */
export function create${pascalName}(config = {}) {
  return {
    status: 'initialized',
    module: '${safeName}',
    ...config,
  }
}
`

      const testContent = `import { create${pascalName} } from './${safeName}'

describe('${safeName} module', () => {
  it('maintains expected contract structure', () => {
    const result = create${pascalName}({ test: true })
    expect(result.test).toBe(true)
    expect(result.status).toBe('initialized')
  })
})
`
      return [
        { path: scaffoldPath, content: scaffoldContent },
        { path: testPath, content: testContent },
      ]
    }

    case 'java': {
      const scaffoldPath = `${prefix}${pascalName}Helper.java`
      const testPath = `${prefix}${pascalName}HelperTest.java`

      const scaffoldContent = `package ${targetDir.replace(/\//g, '.') || 'app'};

public class ${pascalName}Helper {
    public static class Result {
        public final String status = "initialized";
        public final String module = "${safeName}";
    }

    public static Result create() {
        return new Result();
    }
}
`

      const testContent = `package ${targetDir.replace(/\//g, '.') || 'app'};

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class ${pascalName}HelperTest {
    @Test
    public void testContract() {
        ${pascalName}Helper.Result result = ${pascalName}Helper.create();
        assertNotNull(result);
        assertEquals("initialized", result.status);
    }
}
`
      return [
        { path: scaffoldPath, content: scaffoldContent },
        { path: testPath, content: testContent },
      ]
    }

    case 'go': {
      const scaffoldPath = `${prefix}${safeName}_module.go`
      const testPath = `${prefix}${safeName}_module_test.go`
      const pkgName = targetDir.split('/').pop() || 'main'

      const scaffoldContent = `package ${pkgName}

// Create${pascalName} decouples core logic into a modular unit.
func Create${pascalName}(id string) map[string]string {
    return map[string]string{
        "id":     id,
        "status": "initialized",
    }
}
`

      const testContent = `package ${pkgName}

import "testing"

func TestCreate${pascalName}(t *testing.T) {
    res := Create${pascalName}("test-id")
    if res["status"] != "initialized" {
        t.Errorf("expected status initialized, got %s", res["status"])
    }
}
`
      return [
        { path: scaffoldPath, content: scaffoldContent },
        { path: testPath, content: testContent },
      ]
    }

    case 'rust': {
      const scaffoldPath = `${prefix}${safeName}_module.rs`
      const testPath = `${prefix}${safeName}_module_test.rs`

      const scaffoldContent = `/// CodeGenome AI Refactor: Decoupled modular logic.
pub struct ${pascalName}Config {
    pub id: String,
}

pub fn create_${safeName}(id: &str) -> ${pascalName}Config {
    ${pascalName}Config { id: id.to_string() }
}
`

      const testContent = `#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_${safeName}() {
        let res = create_${safeName}("test");
        assert_eq!(res.id, "test");
    }
}
`
      return [
        { path: scaffoldPath, content: scaffoldContent },
        { path: testPath, content: testContent },
      ]
    }

    case 'typescript':
    default: {
      const scaffoldPath = targetDir ? `${targetDir}/${safeName}.ts` : `src/features/${safeName}/${safeName}.ts`
      const testPath = targetDir ? `${targetDir}/${safeName}.test.ts` : `src/features/${safeName}/${safeName}.test.ts`

      const scaffoldContent = `export type ${pascalName}Input = { id?: string }\n\nexport function create${pascalName}(input: ${pascalName}Input = {}) {\n  return {\n    id: input.id || 'default',\n    status: 'initialized',\n  }\n}\n`

      const testImport = testFramework === 'jest'
        ? `import { describe, expect, it } from '@jest/globals'\n`
        : `import { describe, expect, it } from 'vitest'\n`

      const testContent = `${testImport}import { create${pascalName} } from './${safeName}'\n\ndescribe('${pascalName}', () => {\n  it('keeps its contract stable', () => {\n    expect(create${pascalName}({ id: 'demo' })).toEqual({ id: 'demo', status: 'initialized' })\n  })\n})\n`

      return [
        { path: scaffoldPath, content: scaffoldContent },
        { path: testPath, content: testContent },
      ]
    }
  }
}

/**
 * Generates the updated target hotspot content using the appropriate language syntax.
 */
function generateRefactoredTarget({ language, targetFile, safeName, pascalName, targetDir }) {
  const content = targetFile.content || ''

  switch (language) {
    case 'python': {
      const importStmt = targetDir
        ? `from .${safeName}_module import create_${safeName}`
        : `from ${safeName}_module import create_${safeName}`
      return `# [CodeGenome AI Refactor]: Decoupled monolithic logic to reduce cyclomatic complexity
${importStmt}

${content}

# Modular delegation hook
modular_${safeName} = create_${safeName}
`
    }

    case 'go': {
      return `// [CodeGenome AI Refactor]: Decoupled monolithic logic to reduce cyclomatic complexity
${content}
`
    }

    case 'java': {
      return `// [CodeGenome AI Refactor]: Decoupled monolithic logic to reduce cyclomatic complexity
${content}
`
    }

    case 'rust': {
      return `// [CodeGenome AI Refactor]: Decoupled monolithic logic to reduce cyclomatic complexity
mod ${safeName}_module;
pub use ${safeName}_module::create_${safeName};

${content}
`
    }

    case 'javascript': {
      return `// [CodeGenome AI Refactor]: Decoupled monolithic logic to reduce cyclomatic complexity
import { create${pascalName} } from './${safeName}'

${content}

// Modular delegation hook
export const modular${pascalName} = create${pascalName}
`
    }

    case 'typescript':
    default: {
      return `// [CodeGenome AI Refactor]: Decoupled monolithic logic to reduce cyclomatic complexity
import { create${pascalName} } from './${safeName}'

${content}

// Modular delegation hook
export const modular${pascalName} = create${pascalName}
`
    }
  }
}
