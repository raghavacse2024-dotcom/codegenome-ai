import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import config from '../../firebase-applet-config.json'
import type { Analysis } from '../types'

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: config.projectId,
  appId: config.appId,
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  storageBucket: config.storageBucket,
})

export const db = config.firestoreDatabaseId
  ? getFirestore(app, config.firestoreDatabaseId)
  : getFirestore(app)

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export { signInWithPopup, signOut }

/**
 * Validates connection to Firestore safely at boot without throwing unavailable errors.
 */
export async function testFirestoreConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection'))
  } catch (error) {
    // Suppress network unavailable warnings gracefully in offline/sandboxed preview
    console.debug('[Firebase] Operating in offline or local cache mode.')
  }
}

/**
 * Fetches recent analyses directly from persistent Firestore.
 */
export async function getRecentAnalysesFromFirestore(maxCount = 10): Promise<Analysis[]> {
  try {
    const colRef = collection(db, 'analyses')
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(maxCount))
    const snapshot = await getDocs(q)
    const list: Analysis[] = []
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Analysis)
    })
    return list
  } catch (err) {
    console.warn('[Firestore Client] Error reading analyses:', err)
    return []
  }
}
