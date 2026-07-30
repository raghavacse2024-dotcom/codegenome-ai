import { randomUUID } from 'node:crypto'

const analyses = new Map()
const TTL_MS = 1000 * 60 * 60

/**
 * Stores a completed analysis in process memory for download and Q&A routes.
 * @param {object} analysis Completed analysis response.
 * @returns {object} Stored analysis with analysisId.
 */
export function saveAnalysis(analysis) {
  const analysisId = randomUUID()
  const record = { ...analysis, analysisId, createdAt: new Date().toISOString() }
  analyses.set(analysisId, record)
  return record
}

/**
 * Retrieves an analysis record by ID and expires old records opportunistically.
 * @param {string} analysisId Analysis identifier returned by /api/analyze.
 * @returns {object | null} Stored analysis or null.
 */
export function getAnalysis(analysisId) {
  const now = Date.now()
  for (const [id, record] of analyses.entries()) {
    if (now - Date.parse(record.createdAt) > TTL_MS) analyses.delete(id)
  }
  return analyses.get(analysisId) || null
}
