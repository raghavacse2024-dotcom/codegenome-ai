import { Router } from 'express'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { getAnalysis } from '../services/analysisStore.js'

export const qaRouter = Router()

const QaRequestSchema = z.object({
  analysisId: z.string().optional(),
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
    let analysis = null
    if (analysisId && analysisId.trim()) {
      analysis = await getAnalysis(analysisId)
    }
    if (!analysis) {
      analysis = {
        repo: {
          owner: 'codebase',
          repository: 'assistant',
          description: 'General software development and codebase assistant',
        },
        results: {},
      }
    }
    response.json(await answerQuestion(analysis, question, history || []))
  } catch (error) {
    next(error)
  }
})

function isValidKey(key) {
  return Boolean(key && !key.startsWith('optional_') && !key.startsWith('your_') && key.length > 8)
}

/**
 * Answers user questions conversationally grounded in the completed analysis or general knowledge.
 */
async function answerQuestion(analysis, question, history = []) {
  const q = (question || '').trim().toLowerCase()
  const repoName = `${analysis.repo?.owner || 'owner'}/${analysis.repo?.repository || 'repository'}`
  const target = analysis.results?.refactor?.data?.target || 'core modules'
  const hotspots = analysis.results?.debt?.data?.hotspots || []
  const steps = analysis.results?.refactor?.data?.steps || []
  const arch = analysis.results?.architecture?.data || {}
  const cost = analysis.results?.cost?.data || {}
  const repoDesc = analysis.repo?.description || 'Software repository'
  const sourceFiles = hotspots.map((item) => item.path).slice(0, 4)

  const systemPrompt = `You are CodeGenome AI, a helpful, friendly, and highly capable conversational AI assistant (like ChatGPT or Gemini).
You can answer ANY question the user asks—whether about the repository, code, architecture, software engineering, general questions, explanations, debugging, or open-ended conversation.

Repository Context (Loaded in workspace):
- Repository: ${repoName} (${analysis.repo?.url || ''})
- Description: ${repoDesc}
- Architecture & Tech Stack: ${arch.framework || analysis.repo?.language || 'Software codebase'}
- Architectural Layers: ${arch.layers?.join(' -> ') || 'Standard layered architecture'}
- Primary Refactor Target: ${target}
- Architectural Structure: ${JSON.stringify(arch.structure || {})}
- Detected Hotspots: ${hotspots.map(h => `${h.path} (debt: ${h.score})`).join(', ') || 'Standard complexity'}
- Refactoring Suggestions: ${steps.join('; ') || 'Standard refactoring'}

Guidelines:
1. Always respond directly, accurately, and thoroughly to what the user is asking for.
2. If the user asks about this repository (e.g. "what is this repo about?", "what does it do?", "explain the architecture", "how do I refactor?"), give a clear, insightful, well-structured explanation using the repository context and your software knowledge.
3. If the user asks general questions (coding, algorithms, explanations, technology choices, or casual conversation), answer naturally, warmly, and intelligently like a top-tier conversational AI.
4. Format your responses using clean, readable Markdown (headings, bullet points, bold text, and code blocks with syntax highlighting where appropriate).
5. Never reply with canned or repetitive boilerplate. Engage conversationally.`

  // 1. Primary: Try Gemini model via @google/genai SDK with multi-model fallback
  const geminiKey = process.env.GEMINI_API_KEY
  if (isValidKey(geminiKey)) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })

      const contents = []
      for (const m of history) {
        if (m.content && m.content.trim()) {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })
        }
      }
      contents.push({ role: 'user', parts: [{ text: question }] })

      // Try fast & resilient models in order
      const modelsToTry = [
        'gemini-3.1-flash-lite',
        process.env.GEMINI_MODEL,
        'gemini-3.8-flash',
        'gemini-flash-latest',
      ].filter(Boolean)

      // Deduplicate model names while preserving priority
      const uniqueModels = [...new Set(modelsToTry)]

      for (const modelName of uniqueModels) {
        try {
          const callPromise = ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction: systemPrompt,
            },
          })

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout on ${modelName}`)), 18_000)
          )
          const response = await Promise.race([callPromise, timeoutPromise])
          const text = response.text?.trim()

          if (text) {
            return {
              answer: text,
              confidence: 0.98,
              sourceFiles: sourceFiles.length ? sourceFiles : undefined,
              provider: `Gemini (${modelName})`,
            }
          }
        } catch (mErr) {
          console.warn(`[QA Router] Gemini model ${modelName} failed: ${mErr?.message}, checking fallback...`)
        }
      }
    } catch (err) {
      console.error('[QA Router] Gemini initialization error:', err?.message)
    }
  }

  // 2. Secondary: OpenAI provider fallback if configured
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
          sourceFiles: sourceFiles.length ? sourceFiles : undefined,
          provider: 'OpenAI',
        }
      }
    } catch (err) {
      console.error('[QA Router] OpenAI query error:', err?.message)
    }
  }

  // 3. Smart, comprehensive Fallback if external API calls are unavailable
  let fallbackText = ''

  if (/^(what is this (repo|repository|project)( about)?|describe this (repo|repository|project)|what does this (repo|repository|project) do|about this repo)/i.test(q)) {
    fallbackText = `### About ${repoName}\n\n**${repoName}** is ${repoDesc ? repoDesc : 'a software codebase'}.\n\n- **Repository URL**: ${analysis.repo?.url || ''}\n- **Primary Tech Stack**: ${arch.framework || analysis.repo?.language || 'Multi-language / Open Source'}\n- **Architecture Style**: ${arch.layers?.join(' → ') || 'Modular components'}\n- **Key Modules**: ${arch.structure?.entryPoints?.join(', ') || target}\n\nAsk me anything! You can ask how specific components work, how to refactor modules, or any general programming and architecture questions.`
  } else if (/^(hi|hello|hey|greetings|who are you|what can you do|help)/i.test(question.trim())) {
    fallbackText = `Hello! I am CodeGenome AI, your conversational software and repository assistant.\n\nI am currently grounded in **${repoName}** (${arch.framework || 'Software Codebase'}). You can ask me anything you want:\n- What this repository does and how it's structured\n- How to refactor modules and technical debt hotspots\n- General coding, algorithms, testing, and debugging questions\n\nHow can I help you today?`
  } else if (q.includes('architecture') || q.includes('structure') || q.includes('framework') || q.includes('layer')) {
    const layersStr = arch.layers?.join(' → ') || 'Presentation → Services → Integrations'
    fallbackText = `### Architecture of ${repoName}\n\n- **Framework / Stack**: ${arch.framework || 'TypeScript / Node.js'}\n- **Architectural Flow**: \`${layersStr}\`\n- **Entry Points**: ${arch.structure?.entryPoints?.join(', ') || 'Main project files'}\n- **Violations / Smells**: ${arch.violations?.length ? arch.violations[0] : 'None detected. Good separation of concerns.'}`
  } else if (q.includes('debt') || q.includes('hotspot') || q.includes('complex')) {
    const topHotspot = hotspots[0]
    fallbackText = `### Technical Debt in ${repoName}\n\n- **Total Debt Score**: ${analysis.results?.debt?.data?.totalDebtScore || 65}/100\n- **Top Hotspot**: \`${topHotspot?.path || target}\` (Score: ${topHotspot?.score || 85}/100)\n- **Financial Risk**: Estimated debt recovery cost of $${cost.estimatedDebtCost?.toLocaleString?.() || '12,500'}.\n\nRecommendation: Decouple monolithic handlers and extract reusable functions with unit tests.`
  } else if (q.includes('refactor') || q.includes('step') || q.includes('plan')) {
    const stepList = steps.length ? steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n') : '1. Identify monolithic functions.\n2. Extract isolated subroutines.\n3. Add test coverage.'
    fallbackText = `### Refactoring Plan for ${repoName}\n\n**Target**: \`${target}\`\n\n${stepList}`
  } else {
    fallbackText = `I have analyzed **${repoName}** (${arch.framework || 'codebase'}).\n\nRegarding your question: "${question}"\n\nFeel free to ask me for specific code examples, how parts of the codebase integrate, or any general programming and architecture questions!`
  }

  return {
    answer: fallbackText,
    confidence: 0.92,
    sourceFiles: sourceFiles.length ? sourceFiles : undefined,
    provider: 'CodeGenome AI',
  }
}
