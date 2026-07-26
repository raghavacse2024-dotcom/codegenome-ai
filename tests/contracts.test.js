import { describe, expect, it } from 'vitest'
import { RepoUrlSchema, parseRepositoryUrl } from '../server/contracts.js'

describe('repository URL contract', () => {
  it('accepts a canonical public GitHub repository URL', () => expect(parseRepositoryUrl('https://github.com/openai/openai-node')).toMatchObject({ owner: 'openai', repository: 'openai-node' }))
  it('rejects non-GitHub hosts and nested paths', () => {
    expect(() => RepoUrlSchema.parse('https://example.com/a/b')).toThrow()
    expect(() => RepoUrlSchema.parse('https://github.com/a/b/issues')).toThrow()
  })
})
