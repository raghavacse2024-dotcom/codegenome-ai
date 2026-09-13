import { buildRefactorGitDiff } from './diffService.js'

/**
 * Converts a refactor plan into concrete scaffold files that can be previewed or zipped,
 * along with a full Git Diff against the target hotspot file.
 * @param {{ target?: string, scaffolds?: Array<{path: string, content: string}> }} refactorPlan Planner output.
 * @param {{ path: string, content?: string }|null} [targetFile=null] Original hotspot source file.
 * @returns {{ files: Array<{path: string, content: string}>, refactoredTargetContent: string, diff: object }} Generated scaffold bundle and git diff.
 */
export function generateScaffolds(refactorPlan, targetFile = null) {
  const targetPath = refactorPlan?.target || targetFile?.path || 'src/features/feature.ts'
  const targetName = targetPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'feature'
  const safeName = targetName.replace(/[^\w]/g, '') || 'feature'
  const functionName = `create${safeName[0].toUpperCase()}${safeName.slice(1)}`

  let files = []
  if (Array.isArray(refactorPlan?.scaffolds) && refactorPlan.scaffolds.length > 0) {
    files = [...refactorPlan.scaffolds]
  } else {
    files = [
      {
        path: `src/features/${safeName}/${safeName}.ts`,
        content: `export type ${safeName}Input = { id: string }\n\nexport function ${functionName}(input: ${safeName}Input) {\n  return { ...input }\n}\n`,
      },
      {
        path: `src/features/${safeName}/${safeName}.test.ts`,
        content: `import { describe, expect, it } from 'vitest'\nimport { ${functionName} } from './${safeName}'\n\ndescribe('${functionName}', () => {\n  it('keeps its contract stable', () => {\n    expect(${functionName}({ id: 'demo' })).toEqual({ id: 'demo' })\n  })\n})\n`,
      },
    ]
  }

  // Generate refactored target content if target file content is present
  let refactoredTargetContent = ''
  if (targetFile?.content) {
    const relativeModule = `./features/${safeName}/${safeName}`
    refactoredTargetContent = `// [CodeGenome AI Refactor]: Decoupled monolithic logic to reduce cyclomatic complexity\nimport { ${functionName} } from '${relativeModule}'\n\n${targetFile.content}\n\n// Modular delegation hook\nexport const modular${safeName[0].toUpperCase()}${safeName.slice(1)} = ${functionName}\n`
  }

  const diff = buildRefactorGitDiff(targetFile, refactoredTargetContent, files)

  return {
    files,
    refactoredTargetContent,
    diff,
  }
}

