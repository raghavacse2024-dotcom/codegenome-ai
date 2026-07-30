import { Router } from 'express'
import { AnalyzeRequestSchema } from '../contracts.js'
import { analyzeRepository } from '../services/analysisEngine.js'
import { saveAnalysis } from '../services/analysisStore.js'

export const analyzeRouter = Router()

analyzeRouter.post('/analyze', async (request, response, next) => {
  try {
    const { repositoryUrl } = AnalyzeRequestSchema.parse(request.body)
    response.json(saveAnalysis(await analyzeRepository(repositoryUrl)))
  } catch (error) {
    next(error)
  }
})
