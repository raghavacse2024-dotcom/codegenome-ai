import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, doc, getDocFromServer, collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
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

/**
 * Validates connection to Firestore at boot as mandated by Firebase skill.
 */
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'))
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline or database initializing.')
    }
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
