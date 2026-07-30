import OpenAI from 'openai'
import { Router } from 'express'
import { QaRequestSchema } from '../contracts.js'
import { getAnalysis } from '../services/analysisStore.js'

export const qaRouter = Router()

qaRouter.post('/qa', async (request, response, next) => {
  try {
    const { analysisId, question } = QaRequestSchema.parse(request.body)
    const analysis = getAnalysis(analysisId)
    if (!analysis) throw Object.assign(new Error('Analysis not found. Run analysis again before asking questions.'), { status: 404 })
    response.json(await answerQuestion(analysis, question))
  } catch (error) {
    next(error)
  }
})

/**
 * Answers a user question from the completed analysis, optionally enhanced by OpenAI.
 * @param {object} analysis Stored analysis result.
 * @param {string} question User question.
 * @returns {Promise<{answer: string, confidence: number, sourceFiles: string[]}>} Grounded answer.
 */
async function answerQuestion(analysis, question) {
  const sourceFiles = analysis.results.debt.data.hotspots.map((item) => item.path).slice(0, 4)
  const fallback = {
    answer: `Demo Mode Analysis: based on the completed report, start with ${analysis.results.refactor.data.target}. ${analysis.results.debt.data.summary} The recommended next move is: ${analysis.results.refactor.data.steps[0]}`,
    confidence: analysis.isDemo ? 0.68 : 0.78,
    sourceFiles,
  }

  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return fallback

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const result = await client.responses.create({
      model: process.env.OPENAI_MODEL,
      instructions: 'Answer only from the supplied CodeGenome analysis. Return concise JSON with answer, confidence, and sourceFiles.',
      input: JSON.stringify({ question, analysis }),
    })
    return { ...fallback, ...JSON.parse(result.output_text) }
  } catch {
    return fallback
  }
}
