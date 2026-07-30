/**
 * Converts a refactor plan into concrete scaffold files that can be previewed or zipped.
 * @param {{ target?: string, scaffolds?: Array<{path: string, content: string}> }} refactorPlan Planner output.
 * @returns {{ files: Array<{path: string, content: string}> }} Generated scaffold bundle.
 */
export function generateScaffolds(refactorPlan) {
  if (Array.isArray(refactorPlan?.scaffolds) && refactorPlan.scaffolds.length > 0) {
    return { files: refactorPlan.scaffolds }
  }

  const targetName = (refactorPlan?.target || 'src/features/feature.ts').split('/').pop()?.replace(/\.[^.]+$/, '') || 'feature'
  const safeName = targetName.replace(/[^\w]/g, '') || 'feature'
  const functionName = `create${safeName[0].toUpperCase()}${safeName.slice(1)}`

  return {
    files: [
      {
        path: `src/features/${safeName}/${safeName}.ts`,
        content: `export type ${safeName}Input = { id: string }\n\nexport function ${functionName}(input: ${safeName}Input) {\n  return { ...input }\n}\n`,
      },
      {
        path: `src/features/${safeName}/${safeName}.test.ts`,
        content: `import { describe, expect, it } from 'vitest'\nimport { ${functionName} } from './${safeName}'\n\ndescribe('${functionName}', () => {\n  it('keeps its contract stable', () => {\n    expect(${functionName}({ id: 'demo' })).toEqual({ id: 'demo' })\n  })\n})\n`,
      },
    ],
  }
}
