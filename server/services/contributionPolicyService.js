/**
 * Repository Contribution Policy Service for CodeGenome AI.
 * Inspects repositories for AGENTS.md, CONTRIBUTING.md, and .github configurations
 * to detect explicit restrictions on automated PRs, AI-generated code, or automated maintainer communication.
 */

const POLICY_FILE_PATTERNS = [
  /^agents\.md$/i,
  /^\.?github\/agents\.md$/i,
  /^docs\/agents\.md$/i,
  /^contributing(?:\.(?:md|rst|txt))?$/i,
  /^\.?github\/contributing(?:\.(?:md|rst|txt))?$/i,
  /^docs\/contributing(?:\.(?:md|rst|txt))?$/i,
  /^\.?github\/copilot-instructions\.md$/i,
  /^\.?github\/(?:pull_request_template|pr_template)(?:\.md)?$/i,
  /^\.?github\/.*(?:contribut|policy|guideline|agent|pr_template|pull_request_template).*\.(?:md|rst|txt)$/i,
]

const AI_AUTOMATED_PR_DISALLOW_PATTERNS = [
  // Direct bans on AI or automated pull requests / contributions
  /\b(?:no|disallow(?:ed)?|prohibit(?:ed|s)?|forbid(?:den|s)?|ban(?:ned|s)?|reject(?:ed|s)?)\s+(?:any\s+)?(?:ai(?:[- ]generated)?|automated|bot|llm|agentic|machine[- ]generated)\s+(?:pull\s+requests?|prs?|contributions?|code|patches)/i,
  /\b(?:ai(?:[- ]generated)?|automated|bot|llm|agentic|machine[- ]generated)\s+(?:pull\s+requests?|prs?|contributions?|code|patches)\s+(?:are\s+)?(?:strictly\s+)?(?:not\s+allowed|not\s+permitted|prohibited|forbidden|banned|rejected|not\s+accepted|discouraged|closed)/i,
  /\b(?:do\s+not|never)\s+(?:submit|open|create|send)\s+(?:any\s+)?(?:ai(?:[- ]generated)?|automated|bot|llm|agentic)\s+(?:prs?|pull\s+requests?|contributions?)/i,
  /\b(?:do\s+not|never)\s+use\s+(?:ai|llms?|bots?|automated\s+tools?)\s+to\s+(?:create|open|submit|generate)\s+(?:prs?|pull\s+requests?|contributions?)/i,
  /\bautomated\s+(?:prs?|pull\s+requests?)\s+(?:will\s+be\s+closed|are\s+closed|are\s+not\s+accepted|are\s+rejected|are\s+not\s+permitted|are\s+prohibited)/i,
  /\b(?:we\s+do\s+not\s+accept|we\s+reject)\s+(?:any\s+)?(?:ai(?:[- ]generated)?|automated|bot|llm)\s+(?:prs?|pull\s+requests?|contributions?)/i,
  /\bno\s+automated\s+prs?\b/i,
  /\bno\s+automated\s+pull\s+requests?\b/i,
  /\bno\s+ai\s+prs?\b/i,
  /\bno\s+ai\s+pull\s+requests?\b/i,
  /\bno\s+ai-generated\s+(?:code|prs?|pull\s+requests?|contributions?)\b/i,
  /\bautomated\s+tooling\s+may\s+not\s+open\s+pull\s+requests?\b/i,
  // Maintainer communication rules
  /\b(?:ai|automated|bot)\s+(?:generated\s+)?maintainer\s+communication\s+(?:is\s+)?(?:prohibited|forbidden|not\s+allowed|not\s+permitted)/i,
  /\bdo\s+not\s+use\s+ai\s+to\s+interact\s+with\s+maintainers\b/i,
  /\bprohibits?\s+automated\s+prs?\b/i,
  /\bprohibits?\s+automated\s+pull\s+requests?\b/i,
  /\bprohibits?\s+ai-generated\s+prs?\b/i,
]

/**
 * Checks a single file content against AI / automated PR restriction patterns.
 * @param {string} content File content.
 * @returns {{ matches: boolean, ruleSnippet: string | null }}
 */
export function checkContentForPolicyRestrictions(content) {
  if (!content || typeof content !== 'string') {
    return { matches: false, ruleSnippet: null }
  }

  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      // Check even heading lines for direct bans like "# No Automated PRs"
    }
    for (const pattern of AI_AUTOMATED_PR_DISALLOW_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          matches: true,
          ruleSnippet: trimmed.replace(/^[-*#\s>]+/, '').trim(),
        }
      }
    }
  }

  // Full-block match for multi-line sentences
  for (const pattern of AI_AUTOMATED_PR_DISALLOW_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      return {
        matches: true,
        ruleSnippet: match[0].trim(),
      }
    }
  }

  return { matches: false, ruleSnippet: null }
}

/**
 * Inspects a repository's file list for AGENTS.md, CONTRIBUTING.md, and .github policies.
 *
 * @param {Array<{ path: string, content?: string }>} [files=[]]
 * @returns {{
 *   isBlocked: boolean,
 *   state: 'PR_BLOCKED' | 'PR_ELIGIBLE',
 *   policyFile: string | null,
 *   ruleSnippet: string | null,
 *   explanation: string,
 *   allowsManualExport: boolean,
 * }}
 */
export function inspectContributionPolicy(files = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      isBlocked: false,
      state: 'PR_ELIGIBLE',
      policyFile: null,
      ruleSnippet: null,
      explanation: 'No repository contribution restrictions found.',
      allowsManualExport: true,
    }
  }

  // Find all policy files in the repository
  const policyFiles = files.filter((f) => {
    const cleanPath = (f.path || '').replace(/^\/+/, '')
    return POLICY_FILE_PATTERNS.some((pat) => pat.test(cleanPath))
  })

  // Prioritize AGENTS.md, then CONTRIBUTING.md
  policyFiles.sort((a, b) => {
    const aIsAgents = /agents\.md/i.test(a.path)
    const bIsAgents = /agents\.md/i.test(b.path)
    if (aIsAgents && !bIsAgents) return -1
    if (!aIsAgents && bIsAgents) return 1
    return 0
  })

  for (const file of policyFiles) {
    const { matches, ruleSnippet } = checkContentForPolicyRestrictions(file.content || '')
    if (matches) {
      return {
        isBlocked: true,
        state: 'PR_BLOCKED',
        policyFile: file.path,
        ruleSnippet,
        explanation: `Repository contribution policy in '${file.path}' prohibits automated or AI-generated pull requests: "${ruleSnippet}". CodeGenome AI respects maintainer guidelines and will not open automated PRs against this repository.`,
        allowsManualExport: true,
      }
    }
  }

  return {
    isBlocked: false,
    state: 'PR_ELIGIBLE',
    policyFile: null,
    ruleSnippet: null,
    explanation: 'Repository contribution policy permits pull requests.',
    allowsManualExport: true,
  }
}
