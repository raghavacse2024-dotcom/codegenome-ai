import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStructure, fetchRepository } from '../server/github.js'

describe('repository structure parsing', () => {
  afterEach(() => vi.restoreAllMocks())

  it('groups directories, languages, and conventional entry points', () => {
    expect(buildStructure([{ path: 'src/main.ts', content: '' }, { path: 'src/components/Card.tsx', content: '' }, { path: 'api/server.py', content: '' }])).toMatchObject({ rootDirectories: ['src', 'api'], languages: [['TypeScript', 2], ['Python', 1]], entryPoints: ['src/main.ts', 'api/server.py'] })
  })

  it('fetches a bounded public repository sample without calling an untrusted host', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const href = String(url)
      if (href.includes('/git/trees/')) return Promise.resolve(new Response(JSON.stringify({ tree: [{ type: 'blob', path: 'src/main.ts', size: 20 }, { type: 'blob', path: 'README.md', size: 10 }] })))
      if (href.includes('raw.githubusercontent.com')) return Promise.resolve(new Response('export const ready = true'))
      return Promise.resolve(new Response(JSON.stringify({ default_branch: 'main', stargazers_count: 3 })))
    }))
    const result = await fetchRepository('https://github.com/example/demo')
    expect(result.files).toHaveLength(1)
    expect(result.structure.entryPoints).toEqual(['src/main.ts'])
  })
})
