import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ENCRYPTION_ALGORITHM = 'aes-256-gcm'

function getEncryptionKey() {
  const secret = process.env.SESSION_ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configuration error: SESSION_ENCRYPTION_KEY or ENCRYPTION_SECRET must be set in production.')
    }
    // Isolated local development & testing key (never used in production)
    return crypto.scryptSync('codegenome-dev-test-encryption-key-local', 'codegenome-secure-token-salt', 32)
  }
  return crypto.scryptSync(secret, 'codegenome-secure-token-salt', 32)
}

/**
 * Encrypts a sensitive access token using AES-256-GCM before writing to disk.
 * @param {string | null} token Plaintext token.
 * @returns {string | null} Authenticated encrypted string (iv:tag:ciphertext).
 */
export function encryptToken(token) {
  if (!token || typeof token !== 'string') return null
  try {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv)
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const tag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
  } catch (err) {
    console.warn('[SessionStore] Encryption error:', err.message)
    return null
  }
}

/**
 * Decrypts an AES-256-GCM encrypted token payload from disk.
 * Supports backward-compatibility if an unencrypted legacy token is encountered.
 * @param {string | null} encryptedPayload Encrypted string (iv:tag:ciphertext) or legacy token.
 * @returns {string | null} Decrypted plaintext token.
 */
export function decryptToken(encryptedPayload) {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') return null
  // If not formatted as iv:tag:ciphertext, treat as legacy unencrypted token during migration
  if (!encryptedPayload.includes(':')) {
    return encryptedPayload
  }
  try {
    const parts = encryptedPayload.split(':')
    if (parts.length !== 3) return null
    const [ivHex, tagHex, dataHex] = parts
    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    let decrypted = decipher.update(dataHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err) {
    console.warn('[SessionStore] Decryption error:', err.message)
    return null
  }
}

/**
 * Interface-compatible SessionStore for CodeGenomeAI.
 * Uses an in-memory store with AES-256-GCM encrypted persistence on disk.
 */
class MemorySessionStore {
  constructor(filePath) {
    this.filePath = filePath || path.resolve(process.cwd(), '.token_store.json')
    this.sessions = new Map()
    this.oauthStates = new Map()
    this.SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
    this.OAUTH_STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes
    this.load()

    // Periodic cleanup of expired sessions and oauth states
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 15 * 60 * 1000)
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        const now = Date.now()
        let migratedLegacyCount = 0

        for (const [id, record] of Object.entries(raw)) {
          if (record && (now - (record.createdAt || record.timestamp || 0) < this.SESSION_TTL_MS)) {
            // Decrypt token from disk into memory
            const isLegacy = record.token && typeof record.token === 'string' && !record.token.includes(':')
            if (isLegacy) {
              migratedLegacyCount++
            }
            const decryptedToken = decryptToken(record.token)
            this.sessions.set(id, {
              sessionId: id,
              token: decryptedToken,
              userId: record.userId || (record.user?.id ? `gh_${record.user.id}` : record.user?.login) || null,
              user: record.user || null,
              createdAt: record.createdAt || record.timestamp || now,
              expiresAt: record.expiresAt || (now + this.SESSION_TTL_MS),
            })
          }
        }

        // If legacy unencrypted tokens existed on disk, encrypt and re-save immediately
        if (migratedLegacyCount > 0) {
          this.save()
        }
      }
    } catch (err) {
      console.warn('[SessionStore] Could not load persisted session store:', err.message)
    }
  }

  save() {
    try {
      const obj = {}
      for (const [id, record] of this.sessions.entries()) {
        obj[id] = {
          sessionId: id,
          // CRITICAL: Always encrypt tokens before writing to disk
          token: encryptToken(record.token),
          userId: record.userId,
          user: record.user,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
        }
      }
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf8')
    } catch (err) {
      console.warn('[SessionStore] Could not save session store:', err.message)
    }
  }

  /**
   * Generates a cryptographically secure session identifier.
   */
  generateSessionId() {
    return 'cg_sess_' + crypto.randomBytes(32).toString('hex')
  }

  /**
   * Creates a new authenticated session.
   */
  createSession({ token, user, userId }) {
    const sessionId = this.generateSessionId()
    const now = Date.now()
    const canonicalUserId = userId || user?.login || null

    const sessionData = {
      sessionId,
      token: token || null,
      userId: canonicalUserId,
      user: user || null,
      createdAt: now,
      expiresAt: now + this.SESSION_TTL_MS,
    }

    this.sessions.set(sessionId, sessionData)
    this.save()
    return sessionData
  }

  /**
   * Retrieves a session by sessionId if not expired.
   */
  getSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null
    const session = this.sessions.get(sessionId)
    if (!session) return null
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId)
      this.save()
      return null
    }
    return session
  }

  /**
   * Updates an existing session with safe fields.
   */
  updateSession(sessionId, updates = {}) {
    const session = this.getSession(sessionId)
    if (!session) return null

    if (updates.user) {
      session.user = { ...session.user, ...updates.user }
      if (!session.userId && updates.user.login) {
        session.userId = updates.user.login
      }
    }
    if (updates.token) {
      session.token = updates.token
    }
    if (updates.userId) {
      session.userId = updates.userId
    }

    this.sessions.set(sessionId, session)
    this.save()
    return session
  }

  /**
   * Deletes a session upon logout.
   */
  deleteSession(sessionId) {
    if (!sessionId) return false
    const deleted = this.sessions.delete(sessionId)
    if (deleted) this.save()
    return deleted
  }

  /**
   * Generates and stores a cryptographically secure OAuth state.
   */
  createOAuthState(metadata = {}) {
    const state = crypto.randomBytes(32).toString('hex')
    this.oauthStates.set(state, {
      state,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.OAUTH_STATE_TTL_MS,
    })
    return state
  }

  /**
   * Validates and immediately consumes an OAuth state to prevent replay/reuse.
   */
  validateAndConsumeOAuthState(state) {
    if (!state || typeof state !== 'string') return false
    const entry = this.oauthStates.get(state)
    if (!entry) return false

    // Consume immediately to prevent reuse
    this.oauthStates.delete(state)

    if (Date.now() > entry.expiresAt) {
      return false
    }
    return true
  }

  /**
   * Cleans up expired sessions and OAuth states.
   */
  cleanup() {
    const now = Date.now()
    let changed = false
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt && now > session.expiresAt) {
        this.sessions.delete(id)
        changed = true
      }
    }
    for (const [state, entry] of this.oauthStates.entries()) {
      if (now > entry.expiresAt) {
        this.oauthStates.delete(state)
      }
    }
    if (changed) this.save()
  }
}

export const sessionStore = new MemorySessionStore()
