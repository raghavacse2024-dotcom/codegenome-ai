import { describe, expect, it } from 'vitest'
import { saveAnalysis, getAnalysis, getRecentAnalyses, prepareForFirestore, restoreFromFirestore } from '../server/services/analysisStore.js'

describe('Persistent Analysis Store', () => {
  it('correctly prepares and restores nested arrays and undefined values for Firestore compatibility', () => {
    const raw = {
      languages: [['TypeScript', 12], ['JavaScript', 4]],
      matrix: [[1, 2], [3, 4]],
      unused: undefined,
      nullVal: null,
      nested: [{ innerArr: [['a', 'b']] }]
    }

    const prepared = prepareForFirestore(raw)
    // Verify no direct nested arrays exist in prepared
    expect(Array.isArray(prepared.languages[0])).toBe(false)
    expect(prepared.languages[0]._arr).toBe(true)
    expect(prepared.unused).toBeUndefined()

    // Verify restore reproduces the original nested structures
    const restored = restoreFromFirestore(prepared)
    expect(restored.languages).toEqual([['TypeScript', 12], ['JavaScript', 4]])
    expect(restored.matrix).toEqual([[1, 2], [3, 4]])
    expect(restored.nested[0].innerArr).toEqual([['a', 'b']])
  })

  it('saves analysis with nested language tuples and persists cleanly to Firestore', async () => {
    const mockAnalysis = {
      repo: { owner: 'test-org', repository: 'test-repo', url: 'https://github.com/test-org/test-repo' },
      results: { 
        architecture: {
          data: {
            structure: {
              languages: [['TypeScript', 12], ['JavaScript', 4]],
              rootDirectories: ['src']
            }
          }
        },
        debt: { data: { summary: 'Low debt' } } 
      }
    }
    const saved = await saveAnalysis(mockAnalysis)
    expect(saved.analysisId).toBeDefined()
    expect(saved.createdAt).toBeDefined()
    expect(saved.repo.owner).toBe('test-org')

    const fetched = await getAnalysis(saved.analysisId)
    expect(fetched).not.toBeNull()
    expect(fetched.analysisId).toBe(saved.analysisId)
    expect(fetched.results.architecture.data.structure.languages).toEqual([['TypeScript', 12], ['JavaScript', 4]])
  })

  it('retrieves recent analyses from history list', async () => {
    const recents = await getRecentAnalyses(5)
    expect(Array.isArray(recents)).toBe(true)
    expect(recents.length).toBeGreaterThanOrEqual(1)
  })
})
