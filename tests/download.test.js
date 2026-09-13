import { describe, expect, it } from 'vitest'
import { saveAnalysis } from '../server/services/analysisStore.js'
import JSZip from 'jszip'

describe('Download Scaffolds Route', () => {
  it('generates and validates ZIP archive from stored analysis', async () => {
    const analysis = await saveAnalysis({
      repo: { owner: 'test-org', repository: 'download-repo', url: 'https://github.com/test-org/download-repo' },
      results: {
        refactor: {
          data: {
            target: 'src/main.ts',
            scaffolds: [
              { path: 'src/features/feature.ts', content: 'export const f = 1;\n' },
              { path: 'src/features/feature.test.ts', content: 'import { describe } from "vitest";\n' }
            ]
          }
        }
      }
    })

    expect(analysis.analysisId).toBeDefined()

    // Test building zip manually as download route does
    const zip = new JSZip()
    for (const file of analysis.results.refactor.data.scaffolds) {
      zip.file(file.path, file.content)
    }
    zip.file('README.md', 'scaffold readme')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    expect(buffer).toBeDefined()
    expect(buffer.length).toBeGreaterThan(50)

    const loadedZip = await JSZip.loadAsync(buffer)
    expect(loadedZip.file('src/features/feature.ts')).not.toBeNull()
    expect(loadedZip.file('README.md')).not.toBeNull()
  })
})
