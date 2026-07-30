import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeRouter } from './routes/analyze.js'
import { downloadRouter } from './routes/download.js'
import { healthRouter } from './routes/health.js'
import { qaRouter } from './routes/qa.js'
import { errorHandler, requestLogger } from './middleware/errorHandler.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.use(cors())
app.use(express.json({ limit: '10kb' }))
app.use(requestLogger)

app.use('/api', healthRouter)
app.use('/api', analyzeRouter)
app.use('/api', downloadRouter)
app.use('/api', qaRouter)

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Invalid JSON payload.' })
  }
  next(error)
})
app.use(errorHandler)

app.use(express.static(path.join(root, 'dist')))
app.get('*', (_, response) => response.sendFile(path.join(root, 'dist', 'index.html')))

app.listen(port, '0.0.0.0', () => console.log(`CodeGenome listening on ${port}`))
