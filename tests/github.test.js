import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
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

  it('falls back to a repository archive when GitHub API is rate limited', async () => {
    const archive = await new JSZip().file('demo-main/src/main.ts', 'export const ready = true').generateAsync({ type: 'nodebuffer' })
    vi.stubGlobal('fetch', vi.fn((url) => {
      const href = String(url)
      if (href.includes('/repos/')) {
        return Promise.resolve(new Response(JSON.stringify({ message: 'rate limit exceeded' }), { status: 403, headers: { 'content-type': 'application/json' } }))
      }
      if (href.includes('/zip/refs/heads/')) {
        return Promise.resolve(new Response(archive, { status: 200, headers: { 'content-type': 'application/zip' } }))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    }))

    const result = await fetchRepository('https://github.com/example/demo')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('src/main.ts')
    expect(result.repo.defaultBranch).toBe('main')
  })

  it('returns a deterministic demo-safe shell when archive fallback is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const href = String(url)
      if (href.includes('/repos/')) {
        return Promise.resolve(new Response(JSON.stringify({ message: 'rate limit exceeded' }), { status: 403, headers: { 'content-type': 'application/json' } }))
      }
      if (href.includes('/zip/refs/heads/')) {
        return Promise.resolve(new Response('', { status: 404 }))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    }))

    const result = await fetchRepository('https://github.com/example/demo')
    expect(result.files.length).toBeGreaterThan(0)
    expect(result.structure.sampledFileCount).toBe(result.files.length)
    expect(result.fallbackReason).toContain('GitHub archive')
  })
})
