import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, doc, getDocFromServer, collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import config from '../../firebase-applet-config.json'
import type { Analysis } from '../types'

const app = getApps().length > 0 ? getApps()[0] : initializeApp(config)

export const db = getFirestore(app, config.firestoreDatabaseId)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export { signInWithPopup, signOut }

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string
  operationType: OperationType
  path: string | null
  authInfo: {
    userId?: string | null
    email?: string | null
    emailVerified?: boolean | null
    isAnonymous?: boolean | null
    tenantId?: string | null
    providerInfo?: {
      providerId?: string | null
      email?: string | null
    }[]
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo))
  throw new Error(JSON.stringify(errInfo))
}

/**
 * Validates connection to Firestore safely at boot using getDocFromServer.
 * Conforms to Firebase Integration Skill specifications.
 */
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'))
    console.log('[Firebase] Cloud Firestore connection active and verified.')
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline or could not reach Firestore backend.')
    } else {
      console.debug('[Firebase] Connection check completed:', error instanceof Error ? error.message : error)
    }
  }
}

/**
 * Fetches recent analyses directly from persistent Firestore.
 */
export async function getRecentAnalysesFromFirestore(maxCount = 10): Promise<Analysis[]> {
  const pathForAnalyses = 'analyses'
  try {
    const colRef = collection(db, pathForAnalyses)
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(maxCount))
    const snapshot = await getDocs(q)
    const list: Analysis[] = []
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Analysis)
    })
    return list
  } catch (err) {
    console.warn('[Firestore Client] Falling back to server API for analyses:', err)
    return []
  }
}

