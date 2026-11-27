import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { repairAndParseJson, callStructuredAI } from '../server/services/aiClient.js'
import { verifyFindingsAgainstRepo } from '../server/agents.js'

const SampleSchema = z.object({
  summary: z.string().min(3),
  insights: z.array(z.string()).default([]),
})

describe('AI Reliability, Schema Validation, Retries & Grounding', () => {
  it('repairs markdown-fenced or prose-wrapped JSON payloads', () => {
    const raw = 'Here is your analysis:\n```json\n{"summary": "Clean architecture", "insights": ["Good separation"]}\n```'
    const parsed = repairAndParseJson(raw)
    expect(parsed.summary).toBe('Clean architecture')
    expect(parsed.insights).toEqual(['Good separation'])
  })

  it('retries transient 429 rate-limit failures and succeeds cleanly', async () => {
    let calls = 0
    const mockGemini = {
      models: {
        generateContent: vi.fn(async () => {
          calls++
          if (calls === 1) {
            throw Object.assign(new Error('429 rate limit exceeded'), { status: 429 })
          }
          return { text: JSON.stringify({ summary: 'Recovered after retry', insights: ['Ok'] }) }
        }),
      },
    }

    const res = await callStructuredAI({
      agentName: 'Architecture',
      systemInstruction: 'sys',
      userPrompt: 'usr',
      zodSchema: SampleSchema,
      maxRetries: 2,
      retryDelayMs: 5,
      clients: { gemini: mockGemini },
    })

    expect(res.ok).toBe(true)
    expect(res.attempts).toBe(2)
    expect(res.provider).toBe('gemini')
    expect(res.data?.summary).toBe('Recovered after retry')
  })

  it('rejects malformed schema responses and fails over to secondary provider', async () => {
    const badGemini = {
      models: {
        generateContent: vi.fn(async () => ({ text: JSON.stringify({ summary: 'x' }) })), // fails min(3)
      },
    }
    const goodOpenAi = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: JSON.stringify({ summary: 'OpenAI schema valid', insights: [] }) } }],
          })),
        },
      },
    }

    const res = await callStructuredAI({
      agentName: 'Review',
      systemInstruction: 'sys',
      userPrompt: 'usr',
      zodSchema: SampleSchema,
      maxRetries: 0,
      clients: { gemini: badGemini, openai: goodOpenAi },
    })

    expect(res.ok).toBe(true)
    expect(res.provider).toBe('openai')
    expect(res.data?.summary).toBe('OpenAI schema valid')
  })

  it('discards hallucinated AI file paths and clamps out-of-range line numbers against actual repository files', () => {
    const repoFiles = [
      { path: 'src/index.ts', content: 'line1\nline2\nline3\nline4\nline5' },
    ]
    const rawAiFindings = [
      {
        title: 'Hallucinated Secret Leak',
        explanation: 'Invented path',
        filePath: 'src/does-not-exist.ts',
        startLine: 10,
        endLine: 20,
        severity: 'high',
        evidence: 'None',
        suggestedImprovement: 'N/A',
        confidence: 0.9,
      },
      {
        title: 'Valid File Finding With Clamped Lines',
        explanation: 'Real file reference',
        filePath: 'src/index.ts',
        startLine: 2,
        endLine: 999,
        severity: 'medium',
        evidence: 'Observed 5 lines',
        suggestedImprovement: 'Refactor cleanly',
        confidence: 0.8,
      },
    ]

    const verified = verifyFindingsAgainstRepo(rawAiFindings, repoFiles, 'ai-reasoning')
    expect(verified).toHaveLength(1)
    expect(verified[0].filePath).toBe('src/index.ts')
    expect(verified[0].startLine).toBe(2)
    expect(verified[0].endLine).toBe(5)
    expect(verified[0].origin).toBe('ai-reasoning')
    expect(verified[0].verifiedAgainstRepo).toBe(true)
  })
})
