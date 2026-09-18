import { randomUUID } from 'node:crypto'
import { doc, setDoc, getDoc, collection, getDocs, query, where, limit } from 'firebase/firestore'
import { getServerFirestore } from './firestoreServer.js'

const analyses = new Map()
const TTL_MS = 1000 * 60 * 60 * 24 // 24hr cache in memory

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
 * @param {string | null} [userId] Optional authenticated user ID.
 * @returns {Promise<object>} Stored analysis with analysisId.
 */
export async function saveAnalysis(analysis, userId = null) {
  const analysisId = randomUUID()
  const createdAt = new Date().toISOString()
  const record = {
    ...analysis,
    analysisId,
    createdAt,
    userId: userId || null
  }

  // Always keep in local memory for fast synchronous responses
  analyses.set(analysisId, record)

  // Persist to Cloud Firestore database asynchronously
  try {
    const db = getServerFirestore()
    if (db) {
      const docRef = doc(db, 'analyses', analysisId)
      const firestoreData = prepareForFirestore(record)
      await setDoc(docRef, firestoreData)
      console.log(`[Firestore] Successfully persisted analysis ${analysisId} for ${analysis.repo?.owner}/${analysis.repo?.repository}`)
    }
  } catch (err) {
    console.warn(`[Firestore] Failed to persist analysis ${analysisId}:`, err.message)
  }

  return record
}

/**
 * Retrieves an analysis record by ID from memory or persistent Firestore.
 * @param {string} analysisId Analysis identifier returned by /api/analyze.
 * @returns {Promise<object | null>} Stored analysis or null.
 */
export async function getAnalysis(analysisId) {
  if (!analysisId) return null

  // 1. Check in-memory store first
  if (analyses.has(analysisId)) {
    return analyses.get(analysisId)
  }

  // 2. Fallback to Cloud Firestore
  try {
    const db = getServerFirestore()
    if (db) {
      const docRef = doc(db, 'analyses', analysisId)
      const snap = await getDoc(docRef)
      if (snap.exists()) {
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
 * Retrieves recent persisted analyses for a specific user from Firestore database.
 * @param {string | null} userId Authenticated user login identifier.
 * @param {number} [maxCount=12] Max records to return.
 * @returns {Promise<Array<object>>}
 */
export async function getRecentAnalyses(userId = null, maxCount = 12) {
  if (!userId) {
    return []
  }

  try {
    const db = getServerFirestore()
    if (db) {
      const colRef = collection(db, 'analyses')
      const q = query(colRef, where('userId', '==', userId), limit(50))
      const snapshot = await getDocs(q)
      const list = []
      snapshot.forEach((d) => {
        list.push(restoreFromFirestore(d.data()))
      })
      return list
        .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
        .slice(0, maxCount)
    }
  } catch (err) {
    console.warn('[Firestore] Failed to query recent analyses:', err.message)
  }

  // Fallback to recent in-memory records matching user
  return Array.from(analyses.values())
    .filter((item) => item.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, maxCount)
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

  // 2. Delete documents from Firestore
  try {
    const db = getServerFirestore()
    if (db) {
      const colRef = collection(db, 'analyses')
      const q = query(colRef, where('userId', '==', userId))
      const snapshot = await getDocs(q)
      const { deleteDoc } = await import('firebase/firestore')
      const deletes = []
      snapshot.forEach((d) => {
        deletes.push(deleteDoc(d.ref))
      })
      await Promise.all(deletes)
      console.log(`[Firestore] Successfully cleared ${snapshot.size} analyses for user '${userId}'`)
    }
  } catch (err) {
    console.warn(`[Firestore] Failed to clear analyses for user '${userId}':`, err.message)
  }

  return true
}

