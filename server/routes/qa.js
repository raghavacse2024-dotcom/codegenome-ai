import { Router } from 'express'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { getAnalysis } from '../services/analysisStore.js'

export const qaRouter = Router()

const QaRequestSchema = z.object({
  analysisId: z.string().min(1),
  question: z.string().min(1),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).optional(),
})

qaRouter.post('/qa', async (request, response, next) => {
  try {
    const { analysisId, question, history } = QaRequestSchema.parse(request.body)
    const analysis = await getAnalysis(analysisId)
    if (!analysis) throw Object.assign(new Error('Analysis not found. Run analysis again before asking questions.'), { status: 404 })
    response.json(await answerQuestion(analysis, question, history || []))
  } catch (error) {
    next(error)
  }
})

function isValidKey(key) {
  return Boolean(key && !key.startsWith('optional_') && !key.startsWith('your_') && key.length > 8)
}

/**
 * Answers user questions conversationally grounded in the completed analysis.
 */
async function answerQuestion(analysis, question, history = []) {
  const q = (question || '').toLowerCase()
  const repoName = `${analysis.repo?.owner || 'owner'}/${analysis.repo?.repository || 'repository'}`
  const target = analysis.results?.refactor?.data?.target || 'core modules'
  const hotspots = analysis.results?.debt?.data?.hotspots || []
  const steps = analysis.results?.refactor?.data?.steps || []
  const arch = analysis.results?.architecture?.data || {}
  const cost = analysis.results?.cost?.data || {}
  const sourceFiles = hotspots.map((item) => item.path).slice(0, 4)

  const systemPrompt = `You are CodeGenome AI Assistant, a senior staff software engineer and repository AI chatbot.
You are chatting with a developer about the GitHub repository '${repoName}' (${analysis.repo?.url || ''}).

Repository Intelligence Knowledge Base:
- Tech Stack & Architecture: ${JSON.stringify(arch)}
- Technical Debt Index & Hotspots: ${JSON.stringify(analysis.results?.debt?.data || {})}
- Financial Risk & Cost Valuation: ${JSON.stringify(cost)}
- Refactor Strategy & Scaffolds: ${JSON.stringify(analysis.results?.refactor?.data || {})}

Guidelines:
1. Act as a natural, highly intelligent conversational assistant (like Gemini or ChatGPT).
2. Answer any question directly—whether about repository architecture, technical debt, how to implement a fix, general coding concepts, or step-by-step guidance.
3. Use clean Markdown formatting with bold text, bullet points, and code blocks (\`\`\`ts) whenever sharing code examples.
4. Keep explanations clear, engaging, and professional.`

  // 1. Try Z.ai / OpenAI provider if key exists
  if (isValidKey(process.env.OPENAI_API_KEY) && process.env.OPENAI_MODEL) {
    try {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
      })

      const formattedHistory = history.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }))

      const messages = [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        { role: 'user', content: question },
      ]

      const callPromise = client.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages,
      })

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 20_000))
      const result = await Promise.race([callPromise, timeoutPromise])
      const content = result.choices?.[0]?.message?.content?.trim()

      if (content) {
        return {
          answer: content,
          confidence: 0.98,
          sourceFiles: sourceFiles.length ? sourceFiles : [target],
        }
      }
    } catch (err) {
      console.error('[QA Router] OpenAI/Z.ai query error:', err?.message)
    }
  }

  // 2. Try Gemini provider if key exists
  if (isValidKey(process.env.GEMINI_API_KEY)) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
      const prompt = `${systemPrompt}\n\nUser Question: ${question}`

      const callPromise = ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
      })

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 20_000))
      const response = await Promise.race([callPromise, timeoutPromise])
      const text = response.text?.trim()

      if (text) {
        return {
          answer: text,
          confidence: 0.98,
          sourceFiles: sourceFiles.length ? sourceFiles : [target],
        }
      }
    } catch (err) {
      console.error('[QA Router] Gemini query error:', err?.message)
    }
  }

  // 3. Smart Fallback generator if no API keys configured or call failed
  let fallbackText = `Based on repository analysis of **${repoName}**, the priority recommendation is to refactor \`${target}\`.`

  if (q.includes('architecture') || q.includes('structure') || q.includes('framework')) {
    const layersStr = arch.layers?.join(' -> ') || 'Presentation -> Services -> Integrations'
    fallbackText = `Repository **${repoName}** is built with **${arch.framework || 'TypeScript / Node.js'}**.\n\n### Architectural Layers:\n\`${layersStr}\`\n\n- **Entry Points**: ${arch.structure?.entryPoints?.join(', ') || 'src/main.ts'}\n- **Violations**: ${arch.violations?.length ? arch.violations[0] : 'None detected. Good separation of concerns.'}`
  } else if (q.includes('debt') || q.includes('hotspot') || q.includes('complex')) {
    const topHotspot = hotspots[0]
    fallbackText = `### Technical Debt Overview for ${repoName}:\n- **Debt Index**: ${analysis.results?.debt?.data?.totalDebtScore || 65}/100\n- **Primary Hotspot**: \`${topHotspot?.path || target}\` (Score: ${topHotspot?.score || 85}/100)\n\n*Recommendation*: Decouple heavy switch-statements and extract helper methods.`
  } else if (q.includes('refactor') || q.includes('step') || q.includes('plan') || q.includes('how')) {
    const stepList = steps.length ? steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n') : '1. Extract monolithic handlers.\n2. Add unit test coverage.\n3. Verify integration.'
    fallbackText = `### Actionable Refactor Strategy for ${repoName}:\n\nTarget Module: \`${target}\`\n\n${stepList}`
  }

  return {
    answer: fallbackText,
    confidence: 0.90,
    sourceFiles: sourceFiles.length ? sourceFiles : [target],
  }
}
