import { describe, expect, it } from 'vitest'
import { runAnalysis } from '../server/agents.js'

const repository = { repo: { owner: 'demo', repository: 'repo', url: 'https://github.com/demo/repo' }, truncated: false, files: [{ path: 'src/legacy.ts', content: `${'function task() {}\n'.repeat(40)}// TODO: split this module` }] }
describe('agent orchestration', () => {
  it('runs all five agents in order and produces safe scaffolds', async () => {
    const result = await runAnalysis(repository)
    expect(result.events.filter((event) => event.status === 'complete').map((event) => event.agent)).toEqual(['Architecture', 'Technical Debt', 'Risk & Cost', 'Refactor Planner', 'Review'])
    expect(result.results.refactor.data.scaffolds).toHaveLength(2)
    expect(result.source).toBe('demo-safe')
  })
})
