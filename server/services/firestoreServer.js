import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, getApps } from 'firebase/app'
import { initializeFirestore } from 'firebase/firestore'

let dbInstance = null

/**
 * Initializes and provides the Firebase Firestore instance safely.
 * Returns null if configuration is missing or invalid.
 */
export function getServerFirestore() {
  if (dbInstance) return dbInstance

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json')
    if (!fs.existsSync(configPath)) {
      return null
    }

    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const app = getApps().length > 0 ? getApps()[0] : initializeApp({
      projectId: rawConfig.projectId,
      appId: rawConfig.appId,
      apiKey: rawConfig.apiKey,
      authDomain: rawConfig.authDomain,
      storageBucket: rawConfig.storageBucket,
    })

    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, rawConfig.firestoreDatabaseId)

    return dbInstance
  } catch (error) {
    console.warn('[Firestore] Server initialization warning:', error.message)
    return null
  }
}
