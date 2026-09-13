import { describe, expect, it } from 'vitest'
import { runAnalysis } from '../server/agents.js'

describe('Real-Time Progress Emission', () => {
  it('emits real-time agent lifecycle events via onProgress callback', async () => {
    const mockRepo = {
      repo: { owner: 'test-org', repository: 'test-repo', url: 'https://github.com/test-org/test-repo' },
      files: [
        { path: 'src/index.ts', content: 'export const hello = () => "world";' },
        { path: 'src/utils.ts', content: 'export function add(a: number, b: number) { return a + b; }' }
      ]
    }

    const emittedEvents = []
    const onProgress = (event) => {
      emittedEvents.push(event)
    }

    const result = await runAnalysis(mockRepo, onProgress)
    expect(result).toBeDefined()
    expect(result.events).toBeDefined()
    expect(emittedEvents.length).toBeGreaterThanOrEqual(5)

    // Verify running and complete events exist
    const runningEvents = emittedEvents.filter((e) => e.status === 'running')
    const completeEvents = emittedEvents.filter((e) => e.status === 'complete')
    expect(runningEvents.length).toBeGreaterThanOrEqual(1)
    expect(completeEvents.length).toBeGreaterThanOrEqual(1)
    expect(emittedEvents[0]).toHaveProperty('agent')
    expect(emittedEvents[0]).toHaveProperty('at')
  })
})
