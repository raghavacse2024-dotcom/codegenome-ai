import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/health', (_, response) => {
  response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? 'live' : 'demo',
  })
})
