import { useState } from 'react'
import { CheckCircle2, XCircle, MinusCircle, HelpCircle, SkipForward, Terminal, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import type { Analysis, ValidationCheckStatus } from '../types'

function normalizeStatus(raw: string | undefined): ValidationCheckStatus {
  const s = (raw || '').toLowerCase()
  if (s === 'passed' || s === 'pr_created' || s === 'ready' || s === 'satisfied') return 'passed'
  if (s === 'failed' || s === 'blocked' || s === 'pr_blocked' || s === 'github_operation_failed') return 'failed'
  if (s === 'skipped') return 'skipped'
  if (s === 'unknown' || s === 'policy_unknown' || s === 'review_required' || s === 'required' || s === 'branch_created_pr_not_created') return 'unknown'
  return 'not_executed'
}

function StatusBadge({ status, customLabel }: { status: ValidationCheckStatus; customLabel?: string }) {
  const config: Record<
    ValidationCheckStatus,
    { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2 }
  > = {
    passed: {
      label: customLabel || 'PASSED',
      color: '#4ade80',
      bg: 'rgba(34, 197, 94, 0.14)',
      border: 'rgba(34, 197, 94, 0.35)',
      icon: CheckCircle2,
    },
    failed: {
      label: customLabel || 'FAILED',
      color: '#f87171',
      bg: 'rgba(239, 68, 68, 0.14)',
      border: 'rgba(239, 68, 68, 0.35)',
      icon: XCircle,
    },
    not_executed: {
      label: customLabel || 'NOT_EXECUTED',
      color: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.14)',
      border: 'rgba(245, 158, 11, 0.35)',
      icon: MinusCircle,
    },
    skipped: {
      label: customLabel || 'SKIPPED',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.14)',
      border: 'rgba(148, 163, 184, 0.32)',
      icon: SkipForward,
    },
    unknown: {
      label: customLabel || 'UNKNOWN',
      color: '#fb923c',
      bg: 'rgba(249, 115, 22, 0.14)',
      border: 'rgba(249, 115, 22, 0.35)',
      icon: HelpCircle,
    },
  }

  const meta = config[status]
  const Icon = meta.icon

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        fontFamily: 'DM Mono, monospace',
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  )
}

export function ValidationDashboard({ analysis }: { analysis: Analysis }) {
  const [showLogs, setShowLogs] = useState(false)
  const refactor = analysis.results.refactor.data
  const review = analysis.results.review.data
  const validation = refactor.validation || review.validation
  const breakdown = refactor.validationBreakdown || review.validationBreakdown
  const policy = refactor.policy || review.policy
  const logs = refactor.logs || review.logs || {}
  const exitCodes = refactor.exitCodes || review.exitCodes || {}
  const execEnv = refactor.executionEnvironment || review.executionEnvironment || 'isolated-subprocess'

  const policyStatusLabel = policy?.status || 'UNKNOWN'
  const prState = refactor.state || review.state || 'HUMAN_REVIEW_REQUIRED'

  const checks: Array<{
    key: string
    label: string
    status: ValidationCheckStatus
    customLabel?: string
    detail: string
  }> = [
    {
      key: 'staticAnalysis',
      label: 'Static Analysis',
      status: normalizeStatus(breakdown?.staticAnalysis || validation?.staticValidation || 'passed'),
      detail: 'AST complexity & module structure analysis',
    },
    {
      key: 'syntaxValidation',
      label: 'Syntax Validation',
      status: normalizeStatus(breakdown?.syntaxValidation || validation?.syntaxValidation || validation?.lint),
      detail: `Parser check for ${refactor.language || 'target'} syntax`,
    },
    {
      key: 'dependencyValidation',
      label: 'Dependency Validation',
      status: normalizeStatus(breakdown?.dependencyValidation || validation?.dependencyValidation || validation?.typecheck),
      detail: 'Import boundaries and relative module links',
    },
    {
      key: 'testFrameworkCompatibility',
      label: 'Test Framework Compatibility',
      status: normalizeStatus(breakdown?.testFrameworkCompatibility || validation?.testFrameworkValidation),
      detail: `Alignment with ${refactor.testFramework || 'repository'} conventions`,
    },
    {
      key: 'testsExecuted',
      label: 'Tests Executed',
      status: normalizeStatus(breakdown?.testsExecuted || validation?.tests),
      detail:
        exitCodes.tests !== undefined && exitCodes.tests !== null
          ? `Sandbox exit code: ${exitCodes.tests}`
          : 'Requires runnable tests & deps in sandbox',
    },
    {
      key: 'buildExecuted',
      label: 'Build Executed',
      status: normalizeStatus(breakdown?.buildExecuted || validation?.build),
      detail:
        exitCodes.build !== undefined && exitCodes.build !== null
          ? `Compiler exit code: ${exitCodes.build}`
          : 'Compiler / build execution status',
    },
    {
      key: 'lintExecution',
      label: 'Lint Execution',
      status: normalizeStatus(breakdown?.lintExecution || validation?.lint),
      detail: 'Language syntax & lint checks',
    },
    {
      key: 'typecheckExecution',
      label: 'Type-Check Execution',
      status: normalizeStatus(breakdown?.typecheckExecution || 'not_executed'),
      detail:
        exitCodes.typecheck !== undefined && exitCodes.typecheck !== null
          ? `tsc exit code: ${exitCodes.typecheck}`
          : 'Isolated compiler type-check',
    },
    {
      key: 'securityGuardrails',
      label: 'Security Guardrails',
      status: normalizeStatus(breakdown?.securityGuardrails || validation?.securityValidation),
      detail: 'Secret redaction & path safety verification',
    },
    {
      key: 'contributionPolicy',
      label: 'Contribution Policy',
      status: normalizeStatus(breakdown?.contributionPolicy || policy?.status),
      customLabel: policyStatusLabel,
      detail: policy?.policyFile ? `Evaluated ${policy.policyFile}` : 'No explicit AGENTS.md / CONTRIBUTING.md found',
    },
    {
      key: 'humanReviewRequirement',
      label: 'Human Review Requirement',
      status: validation?.safeToPropose ? 'passed' : 'unknown',
      customLabel: validation?.safeToPropose ? 'OPTIONAL_READY' : 'REQUIRED',
      detail: validation?.safeToPropose ? 'All checks passed; PR still requires user trigger' : `Blocked from auto-PR (${prState})`,
    },
    {
      key: 'githubPullRequestStatus',
      label: 'GitHub PR Status',
      status: normalizeStatus(breakdown?.githubPullRequestStatus || 'not_executed'),
      customLabel:
        breakdown?.githubPullRequestStatus === 'passed'
          ? 'PR_CREATED'
          : breakdown?.githubPullRequestStatus === 'failed'
          ? 'FAILED'
          : 'NOT_ATTEMPTED',
      detail: 'Auto-merge is disabled; PRs require explicit user confirmation',
    },
  ]

  const hasLogs = Object.values(logs).some((v) => typeof v === 'string' && v.trim().length > 0)

  return (
    <section className="panel" aria-label="Validation Dashboard">
      <div className="panel-head" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <p className="eyebrow">
            <Shield size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            Execution &amp; Trust Verification
          </p>
          <h2>Validation Dashboard</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="panel-tag">Sandbox: {execEnv}</span>
          {hasLogs && (
            <button
              type="button"
              onClick={() => setShowLogs((prev) => !prev)}
              className="copy-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <Terminal size={12} />
              <span>{showLogs ? 'Hide Sandbox Logs' : 'View Sandbox Logs'}</span>
              {showLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '10px',
          marginTop: '12px',
        }}
      >
        {checks.map((check) => (
          <div
            key={check.key}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(15, 23, 42, 0.45)',
              border: '1px solid rgba(148, 163, 184, 0.16)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #e2e8f0)' }}>
                {check.label}
              </span>
              <StatusBadge status={check.status} customLabel={check.customLabel} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.35 }}>
              {check.detail}
            </span>
          </div>
        ))}
      </div>

      {showLogs && hasLogs && (
        <div
          style={{
            marginTop: '14px',
            padding: '12px',
            borderRadius: '8px',
            background: '#050911',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            fontFamily: 'DM Mono, monospace',
            fontSize: '11px',
            color: '#cbd5e1',
            maxHeight: '260px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {Object.entries(logs)
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([stage, output]) => (
              <div key={stage} style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#38bdf8', textTransform: 'uppercase' }}>[{stage}]</strong>
                <div>{output.trim()}</div>
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
