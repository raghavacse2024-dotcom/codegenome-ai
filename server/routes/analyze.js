import { Router } from 'express'
import { AnalyzeRequestSchema } from '../contracts.js'
import { analyzeRepository } from '../services/analysisEngine.js'
import { saveAnalysis } from '../services/analysisStore.js'
import { getStoredToken, getStoredUser } from './auth.js'

export const analyzeRouter = Router()

analyzeRouter.post('/analyze', async (request, response, next) => {
  try {
    const { repositoryUrl } = AnalyzeRequestSchema.parse(request.body)
    
    // Resolve user token from Authorization header (session ID or direct token)
    let userToken = null
    let userId = null
    const authHeader = request.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice(7).trim()
      const storedUser = getStoredUser(raw)
      userId = storedUser?.login || (raw.startsWith('cg_') ? raw : null)
      userToken = raw.startsWith('cg_') ? (getStoredToken(raw) || raw) : raw
    }

    const analyzedData = await analyzeRepository(repositoryUrl, userToken)
    const savedRecord = await saveAnalysis(analyzedData, userId)
    response.json(savedRecord)
  } catch (error) {
    next(error)
  }
})

/**
 * Server-Sent Events (SSE) Real-Time Analysis Endpoint
 * Streams live agent lifecycle events, progress ticks, and final complete analysis payload.
 */
async function handleAnalyzeStream(request, response, next) {
  // Set SSE headers
  response.setHeader('Content-Type', 'text/event-stream')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.setHeader('X-Accel-Buffering', 'no')
  response.flushHeaders?.()

  let isClosed = false
  request.on('close', () => {
    isClosed = true
  })

  const sendEvent = (event, data) => {
    if (isClosed) return
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const rawUrl = request.method === 'GET' ? request.query.url : request.body?.repositoryUrl
    if (!rawUrl || typeof rawUrl !== 'string') {
      sendEvent('error', { error: 'Missing repository URL parameter.' })
      response.end()
      return
    }

    const { repositoryUrl } = AnalyzeRequestSchema.parse({ repositoryUrl: rawUrl })

    // Resolve user token from Authorization header or query parameter
    let userToken = null
    let userId = null
    const authHeader = request.headers.authorization
    const tokenCandidate = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7).trim() 
      : (typeof request.query.token === 'string' ? request.query.token.trim() : null)

    if (tokenCandidate) {
      const storedUser = getStoredUser(tokenCandidate)
      userId = storedUser?.login || (tokenCandidate.startsWith('cg_') ? tokenCandidate : null)
      userToken = tokenCandidate.startsWith('cg_') ? (getStoredToken(tokenCandidate) || tokenCandidate) : tokenCandidate
    }

    sendEvent('status', { 
      phase: 'starting', 
      message: 'Connection established. Initializing autonomous agent mesh...',
      timestamp: new Date().toISOString()
    })

    const onProgress = (agentEvent) => {
      sendEvent('agent_event', agentEvent)
    }

    const analyzedData = await analyzeRepository(repositoryUrl, userToken, onProgress)
    const savedRecord = await saveAnalysis(analyzedData, userId)

    sendEvent('complete', savedRecord)
    response.write('event: done\ndata: {}\n\n')
    response.end()
  } catch (error) {
    console.error('[SSE Analyze] Streaming error:', error.message)
    sendEvent('error', { error: error.message || 'Analysis encountered an error during stream.' })
    response.end()
  }
}

analyzeRouter.get('/analyze/stream', handleAnalyzeStream)
analyzeRouter.post('/analyze/stream', handleAnalyzeStream)

// Persistent database endpoint: list recent repository scans for authenticated user only
analyzeRouter.get('/history', async (request, response, next) => {
  try {
    const { getRecentAnalyses } = await import('../services/analysisStore.js')

    let userId = null
    const authHeader = request.headers.authorization
    const tokenCandidate = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7).trim() 
      : (typeof request.query.token === 'string' ? request.query.token.trim() : null)

    if (tokenCandidate) {
      const storedUser = getStoredUser(tokenCandidate)
      userId = storedUser?.login || (tokenCandidate.startsWith('cg_') ? tokenCandidate : null)
    }

    // If no user is logged in, return empty persistent history
    if (!userId) {
      return response.json({ analyses: [] })
    }

    const recents = await getRecentAnalyses(userId, 15)
    response.json({ analyses: recents })
  } catch (error) {
    next(error)
  }
})

// Retrieve single analysis from Firestore or cache by ID
analyzeRouter.get('/analysis/:id', async (request, response, next) => {
  try {
    const { getAnalysis } = await import('../services/analysisStore.js')
    const record = await getAnalysis(request.params.id)
    if (!record) {
      return response.status(404).json({ message: 'Analysis not found' })
    }
    response.json(record)
  } catch (error) {
    next(error)
  }
})
