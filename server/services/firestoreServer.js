import { getFirebaseAdmin } from './firebaseAdmin.js'

/**
 * Initializes and provides the server-side Firebase Admin Firestore instance safely.
 * Returns null if Admin SDK initialization or credentials are unavailable.
 */
export function getServerFirestore() {
  try {
    const { firestore } = getFirebaseAdmin()
    return firestore || null
  } catch (error) {
    console.warn('[FirestoreServer] Admin Firestore initialization warning:', error.message)
    return null
  }
}
