import { describe, expect, it } from 'vitest'
import { RepoUrlSchema, parseRepositoryUrl } from '../server/contracts.js'

describe('repository URL contract', () => {
  it('accepts a canonical public GitHub repository URL', () => {
    expect(parseRepositoryUrl('https://github.com/openai/openai-node')).toMatchObject({ owner: 'openai', repository: 'openai-node' })
  })

  it('normalizes shorthand repository inputs', () => {
    expect(parseRepositoryUrl('vercel/turbo')).toMatchObject({ owner: 'vercel', repository: 'turbo' })
    expect(parseRepositoryUrl('github.com/facebook/react')).toMatchObject({ owner: 'facebook', repository: 'react' })
  })

  it('rejects non-GitHub hosts and invalid inputs', () => {
    expect(() => RepoUrlSchema.parse('https://example.com/a/b')).toThrow()
    expect(() => RepoUrlSchema.parse('not-a-valid-url')).toThrow()
    expect(() => RepoUrlSchema.parse('')).toThrow()
  })
})

