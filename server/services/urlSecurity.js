import net from 'node:net'

const ALLOWED_GITHUB_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
])

const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
])

/**
 * Checks whether an IPv4 or IPv6 address is loopback, private, link-local, or reserved.
 * @param {string} host
 * @returns {boolean}
 */
export function isPrivateOrReservedIp(host) {
  const clean = String(host || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!clean) return true
  if (PRIVATE_HOSTNAMES.has(clean)) return true

  const ipVersion = net.isIP(clean)
  if (ipVersion === 4) {
    const parts = clean.split('.').map(Number)
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
    const [a, b] = parts
    if (a === 0) return true // 0.0.0.0/8
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
    return false
  }

  if (ipVersion === 6) {
    if (clean === '::1' || clean === '::') return true
    if (clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) return true
    if (clean.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(clean.slice(7))
    }
    return false
  }

  return false
}

/**
 * Validates an external URL against SSRF rules.
 * Restricts scheme to HTTPS (or HTTP only in test/explicit allowlist) and blocks private/metadata IPs.
 * @param {string} rawUrl
 * @param {{ allowedHosts?: Set<string> | string[], allowHttp?: boolean }} [options]
 * @returns {URL}
 */
export function assertSafeExternalUrl(rawUrl, options = {}) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    const err = new Error('Invalid external URL.')
    err.status = 400
    throw err
  }

  const allowHttp = Boolean(options.allowHttp)
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    const err = new Error(`Unsafe URL protocol '${parsed.protocol}'. Only HTTPS is permitted.`)
    err.status = 400
    throw err
  }

  if (parsed.username || parsed.password) {
    const err = new Error('Credentials embedded in URLs are not permitted.')
    err.status = 400
    throw err
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isPrivateOrReservedIp(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    const err = new Error(`Blocked request to private or internal host '${hostname}'.`)
    err.status = 403
    throw err
  }

  if (options.allowedHosts) {
    const allowedSet = options.allowedHosts instanceof Set
      ? options.allowedHosts
      : new Set(Array.from(options.allowedHosts).map((h) => String(h).toLowerCase()))
    if (!allowedSet.has(hostname)) {
      const err = new Error(`Host '${hostname}' is not in the permitted external host allowlist.`)
      err.status = 403
      throw err
    }
  }

  return parsed
}

/**
 * Validates that a GitHub API / raw / codeload URL strictly targets official GitHub hosts.
 * @param {string} rawUrl
 * @returns {URL}
 */
export function assertSafeGitHubUrl(rawUrl) {
  return assertSafeExternalUrl(rawUrl, { allowedHosts: ALLOWED_GITHUB_HOSTS, allowHttp: false })
}

/**
 * Validates a repository owner or name segment (prevents path traversal and header/URL injection).
 * @param {string} segment
 * @param {string} label
 * @returns {string}
 */
export function validateRepoSegment(segment, label = 'identifier') {
  const clean = String(segment || '').trim()
  if (!clean || clean === '.' || clean === '..' || !/^[a-zA-Z0-9._-]+$/.test(clean) || clean.length > 100) {
    const err = new Error(`Invalid repository ${label}.`)
    err.status = 400
    throw err
  }
  return clean
}

/**
 * Validates a Git branch name safely (rejects path traversal, whitespace, control chars, or ref prefixes).
 * @param {string} branchName
 * @returns {string}
 */
export function validateGitBranchName(branchName) {
  const clean = String(branchName || '').trim()
  if (
    !clean ||
    clean.length > 120 ||
    clean.startsWith('/') ||
    clean.endsWith('/') ||
    clean.startsWith('-') ||
    clean.includes('..') ||
    clean.includes('@{') ||
    clean.includes('\\') ||
    !/^[a-zA-Z0-9._/-]+$/.test(clean)
  ) {
    const err = new Error('Invalid Git branch name.')
    err.status = 400
    throw err
  }
  return clean
}

/**
 * Sanitizes and validates a relative repository file path before building remote raw URLs.
 * @param {string} filePath
 * @returns {string | null}
 */
export function sanitizeRepoFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('\0')) return null
  const parts = normalized.split('/')
  if (parts.some((p) => !p || p === '.' || p === '..')) return null
  return parts.join('/')
}
