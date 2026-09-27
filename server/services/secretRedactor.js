/**
 * Reusable Secret Redactor and Sensitive File Exclusion Utility.
 * Identifies and redacts API keys, credentials, tokens, private keys,
 * and database passwords before content is processed by AI providers.
 */

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pkcs12$/i,
  /^id_rsa(?:\.pub)?$/i,
  /^id_ed25519(?:\.pub)?$/i,
  /^credentials\.json$/i,
  /^service-account(?:.*)?\.json$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.dockercfg$/i,
]

export function isSensitiveFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  const fileName = filePath.split('/').pop() || filePath
  return SENSITIVE_FILE_PATTERNS.some((pat) => pat.test(fileName))
}

const SECRET_PATTERNS = [
  // Private keys (RSA, DSA, EC, OPENSSH)
  {
    name: 'PRIVATE_KEY',
    regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g,
    replace: '[REDACTED_PRIVATE_KEY]',
  },
  // AWS Access Key ID
  {
    name: 'AWS_ACCESS_KEY',
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    replace: '[REDACTED_AWS_ACCESS_KEY]',
  },
  // AWS Secret Access Key assignment
  {
    name: 'AWS_SECRET_KEY',
    regex: /((?:aws_secret_access_key|aws_secret_key)\s*[:=]\s*['"]?)[A-Za-z0-9/+=]{40}(['"]?)/gi,
    replace: '$1[REDACTED_AWS_SECRET]$2',
  },
  // GitHub Tokens (classic and fine-grained)
  {
    name: 'GITHUB_PAT',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
    replace: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    name: 'GITHUB_FINE_GRAINED',
    regex: /\bgithub_pat_[A-Za-z0-9_]{50,255}\b/g,
    replace: '[REDACTED_GITHUB_TOKEN]',
  },
  // OpenAI API Keys
  {
    name: 'OPENAI_API_KEY',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    replace: '[REDACTED_OPENAI_KEY]',
  },
  // Google / Gemini API Keys
  {
    name: 'GOOGLE_API_KEY',
    regex: /\bAIza[0-9A-Za-z-_]{35}\b/g,
    replace: '[REDACTED_GOOGLE_KEY]',
  },
  // Slack Tokens
  {
    name: 'SLACK_TOKEN',
    regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/g,
    replace: '[REDACTED_SLACK_TOKEN]',
  },
  // JWT Tokens
  {
    name: 'JWT_TOKEN',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replace: '[REDACTED_JWT]',
  },
  // Database connection strings containing passwords
  {
    name: 'DB_CONNECTION_PASSWORD',
    regex: /((?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:)[^@\s]+(@[^\s'"]+)/gi,
    replace: '$1[REDACTED_PASSWORD]$2',
  },
  // Common key/secret assignments (e.g. API_KEY=xyz, password: "xyz")
  {
    name: 'GENERIC_ASSIGNMENT_SECRET',
    regex: /((?:api[_-]?key|secret|password|passwd|auth[_-]?token|client[_-]?secret)\s*[:=]\s*['"])(?!\[REDACTED)[^'"\s\[\]]{8,}(['"])/gi,
    replace: '$1[REDACTED_SECRET]$2',
  },
]

/**
 * Scans a string and redacts detected secrets.
 * Does not modify original files; to be used exclusively before sending data to AI providers.
 *
 * @param {string} text Raw text input.
 * @returns {string} Text with all secrets replaced by placeholders.
 */
export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text

  let redacted = text
  for (const { regex, replace } of SECRET_PATTERNS) {
    redacted = redacted.replace(regex, replace)
  }
  return redacted
}

/**
 * Redacts secrets across array of repository file objects for AI ingestion.
 *
 * @param {Array<{ path: string, content: string }>} files
 * @returns {Array<{ path: string, content: string }>}
 */
export function redactRepositoryFiles(files = []) {
  if (!Array.isArray(files)) return []

  return files
    .filter((file) => !isSensitiveFile(file.path))
    .map((file) => ({
      ...file,
      content: redactSecrets(file.content),
    }))
}
