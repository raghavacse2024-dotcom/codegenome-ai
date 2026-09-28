import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

let adminApp = null
let adminAuth = null
let adminFirestore = null

/**
 * Initializes Firebase Admin SDK using available project configuration.
 */
export function getFirebaseAdmin() {
  if (adminApp) {
    return { app: adminApp, auth: adminAuth, firestore: adminFirestore }
  }

  try {
    if (admin.apps && admin.apps.length > 0) {
      adminApp = admin.apps[0]
      adminAuth = admin.auth(adminApp)
      adminFirestore = admin.firestore(adminApp)
      return { app: adminApp, auth: adminAuth, firestore: adminFirestore }
    }

    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json')
    let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT
    let databaseId = undefined

    if (fs.existsSync(configPath)) {
      try {
        const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        if (rawConfig.projectId) projectId = rawConfig.projectId
        if (rawConfig.firestoreDatabaseId) databaseId = rawConfig.firestoreDatabaseId
      } catch {}
    }

    if (!projectId) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required production configuration: FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or firebase-applet-config.json must be set.')
      }
      projectId = 'codegenome-dev-project'
    }

    adminApp = admin.initializeApp({
      projectId,
    })
    adminAuth = admin.auth(adminApp)
    try {
      adminFirestore = databaseId ? adminApp.firestore(databaseId) : adminApp.firestore()
    } catch {
      adminFirestore = adminApp.firestore ? adminApp.firestore() : null
    }

    return { app: adminApp, auth: adminAuth, firestore: adminFirestore }
  } catch (error) {
    console.warn('[FirebaseAdmin] Initialization notice:', error.message)
    return { app: null, auth: null, firestore: null }
  }
}

/**
 * Verifies a Firebase ID token cryptographically using Firebase Admin SDK.
 * Rejects invalid, tampered, or expired tokens.
 * UNVERIFIED JWT PAYLOAD DECODING IS STRICTLY FORBIDDEN.
 *
 * @param {string} idToken Raw Bearer ID token string.
 * @returns {Promise<{ uid: string, email?: string, name?: string, picture?: string, verified: boolean }>}
 */
export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    const err = new Error('Missing or invalid Firebase ID token.')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }

  const cleanToken = idToken.trim()
  if (cleanToken.length < 10) {
    const err = new Error('Malformed Firebase ID token.')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }

  // Test-environment mock token verification (strictly prohibited in production)
  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
  if (isTestEnv && cleanToken.startsWith('test_firebase_token_')) {
    if (cleanToken.includes('expired')) {
      const err = new Error('Firebase ID token has expired.')
      err.status = 401
      err.code = 'TOKEN_EXPIRED'
      throw err
    }
    if (cleanToken.includes('invalid') || cleanToken.includes('bad') || cleanToken.includes('tampered')) {
      const err = new Error('Firebase ID token is invalid.')
      err.status = 401
      err.code = 'INVALID_TOKEN'
      throw err
    }
    const uid = cleanToken.slice('test_firebase_token_'.length) || 'test_user'
    return {
      uid,
      email: `${uid}@example.com`,
      name: `Test User ${uid}`,
      verified: true,
    }
  }

  // Production MUST NOT accept test tokens
  if (cleanToken.startsWith('test_firebase_token_')) {
    const err = new Error('Test tokens are not permitted in production environments.')
    err.status = 401
    err.code = 'UNAUTHORIZED'
    throw err
  }

  const { auth } = getFirebaseAdmin()
  if (!auth || typeof auth.verifyIdToken !== 'function') {
    const error = new Error('Firebase Admin Auth service is unavailable for cryptographic token verification.')
    error.status = 401
    error.code = 'UNAUTHORIZED'
    throw error
  }

  try {
    const decoded = await auth.verifyIdToken(cleanToken)
    if (!decoded || !decoded.uid) {
      const err = new Error('Firebase ID token verification yielded an invalid UID.')
      err.status = 401
      err.code = 'UNAUTHORIZED'
      throw err
    }
    return {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      picture: decoded.picture || null,
      verified: true,
    }
  } catch (err) {
    const error = new Error(`Firebase token cryptographic verification failed: ${err.message}`)
    error.status = 401
    error.code = err.code === 'auth/id-token-expired' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED'
    throw error
  }
}
