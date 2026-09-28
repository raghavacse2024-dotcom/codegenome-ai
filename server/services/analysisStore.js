import { randomUUID } from 'node:crypto'
import { getServerFirestore } from './firestoreServer.js'

const analyses = new Map()

/**
 * Sanitizes an object before writing to Firestore.
 * Firestore does not support nested arrays (arrays containing arrays directly)
 * or undefined property values.
 */
export function prepareForFirestore(val, inArray = false) {
  if (val === undefined) return null
  if (val === null || typeof val !== 'object') return val
  if (val instanceof Date) return val.toISOString()

  if (Array.isArray(val)) {
    const cleaned = val.map((item) => prepareForFirestore(item, true))
    if (inArray) {
      // Wrap nested array inside an object so Firestore accepts it
      return { _arr: true, items: cleaned }
    }
    return cleaned
  }

  const result = {}
  for (const [k, v] of Object.entries(val)) {
    if (v === undefined) continue
    result[k] = prepareForFirestore(v, false)
  }
  return result
}

/**
 * Restores Firestore documents back to native JavaScript data structures.
 * Unwraps { _arr: true, items: [...] } back to native arrays.
 */
export function restoreFromFirestore(val) {
  if (val === null || val === undefined || typeof val !== 'object') return val

  if (Array.isArray(val)) {
    return val.map(restoreFromFirestore)
  }

  if (val._arr === true && Array.isArray(val.items)) {
    return val.items.map(restoreFromFirestore)
  }

  const result = {}
  for (const [k, v] of Object.entries(val)) {
    result[k] = restoreFromFirestore(v)
  }
  return result
}

/**
 * Stores a completed analysis in persistent Firestore database and local cache.
 * @param {object} analysis Completed analysis response.
 * @param {string | null} [userId] Authenticated user ID.
 * @returns {Promise<object>} Stored analysis with analysisId.
 */
export async function saveAnalysis(analysis, userId = null) {
  const analysisId = randomUUID()
  const createdAt = new Date().toISOString()
  const canonicalUserId = userId ? String(userId).trim() : null

  const record = {
    ...analysis,
    analysisId,
    createdAt,
    userId: canonicalUserId,
  }

  // Always keep in local memory for fast synchronous responses and ownership checks
  analyses.set(analysisId, record)

  // Persist to Cloud Firestore database via Admin SDK if available
  try {
    const db = getServerFirestore()
    if (db) {
      const docRef = db.collection('analyses').doc(analysisId)
      const firestoreData = prepareForFirestore(record)
      await docRef.set(firestoreData)
      console.log(`[Firestore] Successfully persisted analysis ${analysisId} for ${analysis.repo?.owner}/${analysis.repo?.repository}`)
    }
  } catch (err) {
    console.warn(`[Firestore] Note on persisting analysis ${analysisId}:`, err.message)
  }

  return record
}

/**
 * Retrieves an analysis record by ID from memory or persistent Firestore.
 * @param {string} analysisId Analysis identifier.
 * @returns {Promise<object | null>} Stored analysis or null.
 */
export async function getAnalysis(analysisId) {
  if (!analysisId || typeof analysisId !== 'string') return null

  // 1. Check in-memory store first
  if (analyses.has(analysisId)) {
    return analyses.get(analysisId)
  }

  // 2. Fallback to Cloud Firestore via Admin SDK
  try {
    const db = getServerFirestore()
    if (db) {
      const docRef = db.collection('analyses').doc(analysisId)
      const snap = await docRef.get()
      if (snap.exists) {
        const data = restoreFromFirestore(snap.data())
        analyses.set(analysisId, data)
        return data
      }
    }
  } catch (err) {
    console.warn(`[Firestore] Failed to fetch analysis ${analysisId}:`, err.message)
  }

  return null
}

/**
 * Retrieves recent persisted analyses for a specific user from Firestore or cache.
 * Flexibly accepts (userId, maxCount) or (maxCount) to support both test suites and user queries.
 * @param {string | number | null} [userIdOrCount] User ID or count.
 * @param {number} [maxCount=12] Max records to return.
 * @returns {Promise<Array<object>>}
 */
export async function getRecentAnalyses(userIdOrCount = null, maxCount = 12) {
  let userId = null
  let limitCount = maxCount

  if (typeof userIdOrCount === 'number') {
    limitCount = userIdOrCount
    userId = null
  } else if (typeof userIdOrCount === 'string') {
    userId = userIdOrCount.trim()
  }

  try {
    const db = getServerFirestore()
    if (db) {
      let queryRef = db.collection('analyses')
      if (userId) {
        queryRef = queryRef.where('userId', '==', userId).limit(50)
      } else {
        queryRef = queryRef.limit(50)
      }

      const snapshot = await queryRef.get()
      const list = []
      snapshot.forEach((d) => {
        list.push(restoreFromFirestore(d.data()))
      })
      if (list.length > 0) {
        return list
          .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
          .slice(0, limitCount)
      }
    }
  } catch (err) {
    console.warn('[Firestore] Query recent analyses notice:', err.message)
  }

  // Fallback to recent in-memory records matching user (or all if userId is null)
  return Array.from(analyses.values())
    .filter((item) => (userId ? item.userId === userId : true))
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, limitCount)
}

/**
 * Clears all persisted analysis records for a specific user from Firestore and in-memory cache.
 * @param {string} userId Authenticated user identifier.
 * @returns {Promise<boolean>}
 */
export async function clearUserAnalyses(userId) {
  if (!userId) return false

  // 1. Remove from in-memory cache
  for (const [id, item] of analyses.entries()) {
    if (item.userId === userId) {
      analyses.delete(id)
    }
  }

  // 2. Delete documents from Firestore via Admin SDK
  try {
    const db = getServerFirestore()
    if (db) {
      const snapshot = await db.collection('analyses').where('userId', '==', userId).get()
      if (!snapshot.empty) {
        const batch = db.batch()
        snapshot.forEach((doc) => {
          batch.delete(doc.ref)
        })
        await batch.commit()
        console.log(`[Firestore] Successfully cleared ${snapshot.size} analyses for user '${userId}'`)
      }
    }
  } catch (err) {
    console.warn(`[Firestore] Failed to clear analyses for user '${userId}':`, err.message)
  }

  return true
}
