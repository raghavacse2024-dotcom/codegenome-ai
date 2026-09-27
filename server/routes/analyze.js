import { Router } from 'express'
import { AnalyzeRequestSchema } from '../contracts.js'
import { analyzeRepository } from '../services/analysisEngine.js'
import { saveAnalysis, getAnalysis, getRecentAnalyses, clearUserAnalyses } from '../services/analysisStore.js'
import { resolveAuthenticatedUser } from '../services/authResolver.js'
import { analyzeRateLimiter } from '../middleware/rateLimiter.js'

export const analyzeRouter = Router()

analyzeRouter.post('/analyze', analyzeRateLimiter, async (request, response, next) => {
  try {
    const { repositoryUrl } = AnalyzeRequestSchema.parse(request.body)
    
    // Resolve user token from Authorization header or active session
    const authUser = resolveAuthenticatedUser(request)
    const userId = authUser?.userId || null
    const userToken = authUser?.token || null

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

    // Resolve user from Authorization header or query token
    const authUser = resolveAuthenticatedUser(request)
    const userId = authUser?.userId || null
    const userToken = authUser?.token || null

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

analyzeRouter.get('/analyze/stream', analyzeRateLimiter, handleAnalyzeStream)
analyzeRouter.post('/analyze/stream', analyzeRateLimiter, handleAnalyzeStream)

// Persistent database endpoint: list recent repository scans for authenticated user only
analyzeRouter.get('/history', async (request, response, next) => {
  try {
    const authUser = resolveAuthenticatedUser(request)
    if (!authUser || !authUser.userId) {
      return response.json({ analyses: [] })
    }

    const recents = await getRecentAnalyses(authUser.userId, 15)
    response.json({ analyses: recents })
  } catch (error) {
    next(error)
  }
})

// Clear persistent scan history for authenticated user only
analyzeRouter.delete('/history', async (request, response, next) => {
  try {
    const authUser = resolveAuthenticatedUser(request)
    if (!authUser || !authUser.userId) {
      return response.status(401).json({ error: 'Authentication required to clear analysis history.', code: 'UNAUTHORIZED' })
    }

    await clearUserAnalyses(authUser.userId)
    response.json({ success: true })
  } catch (error) {
    next(error)
  }
})

/**
 * Retrieve single analysis from Firestore or cache by ID.
 * Enforces ownership verification:
 * - Not authenticated -> 401
 * - Analysis doesn't exist -> 404
 * - Analysis exists but belongs to another user -> 403
 * - Owner -> return analysis
 */
analyzeRouter.get('/analysis/:id', async (request, response, next) => {
  try {
    const authUser = resolveAuthenticatedUser(request)
    if (!authUser) {
      return response.status(401).json({
        error: 'Authentication required to access analysis records.',
        code: 'UNAUTHORIZED'
      })
    }

    const record = await getAnalysis(request.params.id)
    if (!record) {
      return response.status(404).json({
        error: 'Analysis not found.',
        code: 'NOT_FOUND'
      })
    }

    // Ownership verification
    const currentUserId = authUser.userId
    const currentUserLogin = authUser.user?.login
    const recordUserId = record.userId

    // If analysis is owned by someone else, forbid access
    if (recordUserId && recordUserId !== currentUserId && recordUserId !== currentUserLogin) {
      return response.status(403).json({
        error: 'Access forbidden: you do not have permission to view this analysis.',
        code: 'FORBIDDEN'
      })
    }

    response.json(record)
  } catch (error) {
    next(error)
  }
})
