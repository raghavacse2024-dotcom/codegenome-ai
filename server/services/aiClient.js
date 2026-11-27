import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { assertSafeExternalUrl } from './urlSecurity.js'

const isTestEnv = () => Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')

export function isValidAiKey(key) {
  return Boolean(
    key &&
      typeof key === 'string' &&
      !key.startsWith('optional_') &&
      !key.startsWith('your_') &&
      !key.startsWith('mock-') &&
      key.trim().length > 10
  )
}

/**
 * Extracts and parses a JSON object from raw LLM text, handling markdown code fences
 * or leading/trailing prose gracefully.
 * @param {string} rawText
 * @returns {object}
 */
export function repairAndParseJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty AI response payload')
  }

  const trimmed = rawText.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // Strip markdown code fences if present
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenceMatch && fenceMatch[1]) {
      try {
        return JSON.parse(fenceMatch[1].trim())
      } catch {}
    }

    // Attempt balanced JSON object slice
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1)
      return JSON.parse(candidate)
    }

    throw new Error('Malformed JSON returned by AI provider')
  }
}

function isRetryableError(err) {
  const msg = String(err?.message || '').toLowerCase()
  const status = err?.status || err?.code || 0
  return (
    status === 429 ||
    status === 503 ||
    status === 502 ||
    status === 504 ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('503')
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeoutRace(promise, timeoutMs, label) {
  let timer = null
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${timeoutMs}ms`), { status: 504 })), timeoutMs)
        if (timer.unref) timer.unref()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Executes a structured JSON AI call with timeout, exponential backoff retries,
 * JSON repair, strict Zod schema validation, and Gemini -> OpenAI failover.
 *
 * @param {object} options
 * @param {string} options.agentName
 * @param {string} options.systemInstruction
 * @param {string} options.userPrompt
 * @param {import('zod').ZodTypeAny} options.zodSchema
 * @param {object} [options.geminiSchema]
 * @param {number} [options.timeoutMs=8000]
 * @param {number} [options.maxRetries=2]
 * @param {number} [options.retryDelayMs=400]
 * @param {object} [options.clients] Optional injected test clients ({ gemini, openai })
 * @returns {Promise<{ ok: boolean, data: object | null, provider: string, attempts: number, error?: string }>}
 */
export async function callStructuredAI({
  agentName,
  systemInstruction,
  userPrompt,
  zodSchema,
  geminiSchema = null,
  timeoutMs = 8_000,
  maxRetries = 2,
  retryDelayMs = isTestEnv() ? 10 : 400,
  clients = {},
}) {
  let attempts = 0
  let lastError = null

  // 1. Primary Provider: Google Gemini SDK
  const geminiKey = process.env.GEMINI_API_KEY
  if (clients.gemini || isValidAiKey(geminiKey)) {
    const ai =
      clients.gemini ||
      new GoogleGenAI({
        apiKey: geminiKey.trim(),
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      })

    const modelName = process.env.GEMINI_MODEL || 'gemini-4-hydrogen'

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts++
      try {
        const config = {
          responseMimeType: 'application/json',
          systemInstruction,
        }
        if (geminiSchema) {
          config.responseSchema = geminiSchema
        }

        const response = await withTimeoutRace(
          ai.models.generateContent({
            model: modelName,
            contents: userPrompt,
            config,
          }),
          timeoutMs,
          `Gemini:${agentName}`
        )

        const rawText = typeof response?.text === 'string' ? response.text : ''
        const parsed = repairAndParseJson(rawText)
        const validated = zodSchema.safeParse(parsed)
        if (!validated.success) {
          throw new Error(`Schema validation failed for ${agentName}: ${validated.error.issues[0]?.message || 'invalid shape'}`)
        }

        return {
          ok: true,
          data: validated.data,
          provider: 'gemini',
          attempts,
        }
      } catch (err) {
        lastError = err
        if (attempt < maxRetries && isRetryableError(err)) {
          await sleep(retryDelayMs * Math.pow(2, attempt))
          continue
        }
        break
      }
    }
  }

  // 2. Failover Provider: OpenAI-compatible API
  const openaiKey = process.env.OPENAI_API_KEY
  const openaiModel = process.env.OPENAI_MODEL
  if (clients.openai || (isValidAiKey(openaiKey) && openaiModel)) {
    try {
      let baseURL
      if (process.env.OPENAI_BASE_URL) {
        baseURL = await assertSafeExternalUrl(process.env.OPENAI_BASE_URL, { allowAnyPublicHost: true })
      }
      const client =
        clients.openai ||
        new OpenAI({
          apiKey: openaiKey.trim(),
          ...(baseURL ? { baseURL } : {}),
        })

      for (let attempt = 0; attempt <= 1; attempt++) {
        attempts++
        try {
          const response = await withTimeoutRace(
            client.chat.completions.create({
              model: openaiModel || 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
            }),
            timeoutMs,
            `OpenAI:${agentName}`
          )

          const rawText = response?.choices?.[0]?.message?.content || ''
          const parsed = repairAndParseJson(rawText)
          const validated = zodSchema.safeParse(parsed)
          if (!validated.success) {
            throw new Error(`Schema validation failed for ${agentName}: ${validated.error.issues[0]?.message || 'invalid shape'}`)
          }

          return {
            ok: true,
            data: validated.data,
            provider: 'openai',
            attempts,
          }
        } catch (err) {
          lastError = err
          if (attempt < 1 && isRetryableError(err)) {
            await sleep(retryDelayMs)
            continue
          }
          break
        }
      }
    } catch (err) {
      lastError = err
    }
  }

  return {
    ok: false,
    data: null,
    provider: 'deterministic',
    attempts,
    error: lastError?.message || 'AI provider unavailable',
  }
}

/**
 * Executes a conversational QA call with retries, timeout protection, and Gemini -> OpenAI failover.
 */
export async function callConversationalAI({
  systemInstruction,
  history = [],
  question,
  timeoutMs = 12_000,
  maxRetries = 1,
  retryDelayMs = isTestEnv() ? 10 : 350,
  clients = {},
}) {
  const geminiKey = process.env.GEMINI_API_KEY
  if (clients.gemini || isValidAiKey(geminiKey)) {
    const ai =
      clients.gemini ||
      new GoogleGenAI({
        apiKey: geminiKey.trim(),
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      })
    const modelName = process.env.GEMINI_MODEL || 'gemini-4-hydrogen'

    const contents = [
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: question }] },
    ]

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await withTimeoutRace(
          ai.models.generateContent({
            model: modelName,
            contents,
            config: { systemInstruction },
          }),
          timeoutMs,
          'Gemini:QA'
        )
        const text = typeof response?.text === 'string' ? response.text.trim() : ''
        if (text) {
          return { ok: true, text, provider: `Gemini (${modelName})` }
        }
      } catch (err) {
        if (attempt < maxRetries && isRetryableError(err)) {
          await sleep(retryDelayMs * Math.pow(2, attempt))
          continue
        }
        break
      }
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY
  const openaiModel = process.env.OPENAI_MODEL
  if (clients.openai || (isValidAiKey(openaiKey) && openaiModel)) {
    try {
      let baseURL
      if (process.env.OPENAI_BASE_URL) {
        baseURL = await assertSafeExternalUrl(process.env.OPENAI_BASE_URL, { allowAnyPublicHost: true })
      }
      const client =
        clients.openai ||
        new OpenAI({
          apiKey: openaiKey.trim(),
          ...(baseURL ? { baseURL } : {}),
        })

      const messages = [
        { role: 'system', content: systemInstruction },
        ...history.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        { role: 'user', content: question },
      ]

      const response = await withTimeoutRace(
        client.chat.completions.create({
          model: openaiModel || 'gpt-4o-mini',
          messages,
        }),
        timeoutMs,
        'OpenAI:QA'
      )

      const text = response?.choices?.[0]?.message?.content?.trim()
      if (text) {
        return { ok: true, text, provider: 'OpenAI' }
      }
    } catch {}
  }

  return { ok: false, text: null, provider: 'deterministic' }
}
