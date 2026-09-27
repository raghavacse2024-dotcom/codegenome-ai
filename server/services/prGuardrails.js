import path from 'node:path'

export const PR_GUARDRAIL_CONFIG = {
  maxChangedFiles: 15,
  maxChangedLines: 1200,
  blockedExtensions: ['.sh', '.bash', '.exe', '.bat', '.cmd', '.dll', '.bin', '.env', '.pem', '.key', '.p12', '.sql'],
  protectedPathPatterns: [
    /^\.?github\/(?:workflows|actions)\//i,
    /^docker-compose(?:.*)?\.ya?ml$/i,
    /^Dockerfile(?:\..+)?$/i,
    /^(?:k8s|kubernetes|helm)\//i,
    /^(?:.*\/)?migrations?\//i,
    /^prisma\/migrations\//i,
    /^\.env(?:\..+)?$/i,
    /^(?:render|vercel|netlify)\.ya?ml$/i,
    /^(?:deploy|release)(?:.*)?\.(?:sh|ya?ml)$/i,
  ],
}

/**
 * Validates planned PR changes against safety guardrails.
 *
 * @param {object} params
 * @param {Array<{ path: string, content: string }>} params.files
 * @param {string} [params.patch]
 * @param {boolean} [params.confirmedHighRisk=false]
 * @returns {{ passed: boolean, violations: string[], isHighRisk: boolean, reason: string | null }}
 */
export function validatePrGuardrails({ files = [], patch = '', confirmedHighRisk = false }) {
  const violations = []
  let isHighRisk = false

  // 1. Check file count limit
  if (files.length > PR_GUARDRAIL_CONFIG.maxChangedFiles) {
    violations.push(
      `Changed file count (${files.length}) exceeds safety limit of ${PR_GUARDRAIL_CONFIG.maxChangedFiles} files.`
    )
  }

  // 2. Check changed line count in diff / patch
  const diffLines = patch.split(/\r?\n/)
  const addedLines = diffLines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  const deletedLines = diffLines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length
  const totalChangedLines = addedLines + deletedLines

  if (totalChangedLines > PR_GUARDRAIL_CONFIG.maxChangedLines) {
    violations.push(
      `Diff size (${totalChangedLines} lines) exceeds maximum PR safety threshold of ${PR_GUARDRAIL_CONFIG.maxChangedLines} lines.`
    )
  }

  // 3. Check each file for protected paths and blocked extensions
  for (const file of files) {
    const rawPath = (file.path || '').replace(/^\/+/, '')
    const ext = path.extname(rawPath).toLowerCase()
    const baseName = path.basename(rawPath).toLowerCase()

    // Blocked extensions & environment files
    if (PR_GUARDRAIL_CONFIG.blockedExtensions.includes(ext) || baseName === '.env' || baseName.startsWith('.env.')) {
      violations.push(`File '${rawPath}' has prohibited executable or sensitive extension '${ext || '.env'}'.`)
    }

    // Protected infrastructure, workflow, and migration paths
    for (const pattern of PR_GUARDRAIL_CONFIG.protectedPathPatterns) {
      if (pattern.test(rawPath)) {
        violations.push(`File '${rawPath}' matches protected critical path: ${pattern.toString()}`)
        isHighRisk = true
      }
    }

    // Check for destructive script content
    if (file.content && /rm\s+-rf|curl\s+.*\|\s*(?:bash|sh)|DROP\s+TABLE/i.test(file.content)) {
      violations.push(`File '${rawPath}' contains high-risk destructive shell or SQL command.`)
      isHighRisk = true
    }
  }

  if (violations.length > 0) {
    // If high risk and user explicitly confirmed, check whether other violations remain
    if (isHighRisk && !confirmedHighRisk) {
      return {
        passed: false,
        isHighRisk: true,
        violations,
        reason: `PR blocked by safety guardrails: High-risk changes detected (${violations.join('; ')}). Explicit confirmation required.`,
      }
    }
    return {
      passed: false,
      isHighRisk,
      violations,
      reason: `PR blocked by safety guardrails: ${violations.join('; ')}`,
    }
  }

  return {
    passed: true,
    violations: [],
    isHighRisk: false,
    reason: null,
  }
}
