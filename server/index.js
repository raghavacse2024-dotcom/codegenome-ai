import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AnalyzeRequestSchema } from './contracts.js'
import { fetchRepository } from './github.js'
import { runAnalysis } from './agents.js'
const app = express(), port = Number(process.env.PORT || 3001)
app.use(cors()); app.use(express.json({ limit: '10kb' }))
app.get('/api/health', (_, response) => response.json({ ok: true, service: 'codegenome-api' }))
app.post('/api/analyze', async (request, response) => {
  try {
    const { repositoryUrl } = AnalyzeRequestSchema.parse(request.body)
    response.json(await runAnalysis(await fetchRepository(repositoryUrl)))
  } catch (error) {
    response.status(error?.status || (error?.name === 'ZodError' ? 400 : 502)).json({ error: error?.issues?.[0]?.message || error.message || 'Analysis failed. Please retry.' })
  }
})
app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Invalid JSON payload.' })
  }
  if (response.headersSent) return next(error)
  response.status(error?.status || 500).json({ error: error?.message || 'Internal server error.' })
})
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
app.use(express.static(path.join(root, 'dist')))
app.get('*', (_, response) => response.sendFile(path.join(root, 'dist', 'index.html')))
app.listen(port, '0.0.0.0', () => console.log(`CodeGenome listening on ${port}`))
