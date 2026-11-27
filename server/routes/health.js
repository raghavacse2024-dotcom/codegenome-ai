import { Router } from 'express'
import { resolveExecutionProvider } from '../services/sandboxExecutor.js'

export const healthRouter = Router()

healthRouter.get('/health', async (_, response) => {
  const provider = await resolveExecutionProvider()
  response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? 'live' : 'demo',
    sandbox: {
      available: provider.available,
      provider: provider.provider,
      status: provider.available ? 'AVAILABLE' : 'SANDBOX_UNAVAILABLE',
    },
  })
})
