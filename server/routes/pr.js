import { Router } from 'express'
import { z } from 'zod'
import { getAnalysis } from '../services/analysisStore.js'
import { createPullRequest } from '../services/prService.js'
import { validateRefactor } from '../services/refactorValidator.js'
import { resolveAuthenticatedUser, assertAnalysisOwnership } from '../services/authResolver.js'
import { prRateLimiter } from '../middleware/rateLimiter.js'
import { validateGitBranchName, validateRepoSegment } from '../services/urlSecurity.js'

export const prRouter = Router()

const CreatePrSchema = z.object({
  analysisId: z.string().min(1),
  title: z.string().max(200).optional(),
  branch: z.string().max(120).optional(),
  body: z.string().max(8000).optional(),
  baseBranch: z.string().max(120).optional(),
  confirmedHighRisk: z.boolean().optional(),
})

/**
 * Validates a refactor package in sandbox without pushing changes.
 * Protected by analysis ownership verification.
 */
prRouter.post('/pr/validate', prRateLimiter, async (req, res, next) => {
  try {
    const authUser = await resolveAuthenticatedUser(req)
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required to validate refactor.', code: 'UNAUTHORIZED' })
    }

    const { analysisId } = z.object({ analysisId: z.string().min(1) }).parse(req.body)
    const analysis = await getAnalysis(analysisId)
    if (!analysis) {
      return res.status(404).json({ error: `Analysis with ID '${analysisId}' not found.`, code: 'NOT_FOUND' })
    }

    assertAnalysisOwnership(analysis, authUser)

    const refactorData = analysis.results?.refactor?.data || {}
    const scaffolds = refactorData.scaffolds || []
    const refactoredTarget = refactorData.refactoredTarget
    const targetPath = refactorData.target

    const filesToValidate = [...scaffolds]
    if (targetPath && refactoredTarget && !filesToValidate.some((f) => f.path === targetPath)) {
      filesToValidate.push({ path: targetPath, content: refactoredTarget })
    }

    const validation = await validateRefactor({
      files: filesToValidate,
      targetPath,
      refactoredTarget,
      baseFiles: analysis.files || [],
      policyFiles: analysis.policyFiles || [],
      patch: refactorData.diff?.rawPatch || '',
      confirmedHighRisk: Boolean(req.body.confirmedHighRisk),
      userId: authUser.userId || 'anonymous',
    })

    res.json({
      state: validation.state,
      sandboxAvailable: validation.sandboxAvailable,
      sandboxStatus: validation.sandboxStatus,
      unavailableReason: validation.unavailableReason,
      policy: validation.policy,
      language: validation.language,
      validation: validation.validation,
      validationBreakdown: validation.validationBreakdown,
      executionEnvironment: validation.executionEnvironment,
      exitCodes: validation.exitCodes,
      guardrails: validation.guardrails,
      failedStep: validation.failedStep,
      logs: validation.logs,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Creates an automated Pull Request for the refactor recommendation.
 * Requires authenticated user, verified analysis ownership, and authenticated GitHub credentials.
 */
prRouter.post('/pr/create', prRateLimiter, async (req, res, next) => {
  try {
    const authUser = await resolveAuthenticatedUser(req)
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required to create a Pull Request.', code: 'UNAUTHORIZED' })
    }

    const { analysisId, title, branch, body, baseBranch, confirmedHighRisk } = CreatePrSchema.parse(req.body)

    const analysis = await getAnalysis(analysisId)
    if (!analysis) {
      return res.status(404).json({ error: `Analysis with ID '${analysisId}' not found.`, code: 'NOT_FOUND' })
    }

    assertAnalysisOwnership(analysis, authUser)

    const repo = analysis.repo
    if (!repo?.owner || !repo?.repository) {
      return res.status(400).json({ error: 'Analysis record does not contain valid repository details.' })
    }

    const cleanOwner = validateRepoSegment(repo.owner, 'owner')
    const cleanRepo = validateRepoSegment(repo.repository, 'repository')
    const cleanBranch = branch ? validateGitBranchName(branch) : undefined
    const cleanBaseBranch = baseBranch
      ? validateGitBranchName(baseBranch)
      : validateGitBranchName(repo.defaultBranch || 'main')

    // Resolve user auth token & user profile strictly
    let token = authUser.token || null
    let user = authUser.user || null

    const customPat = req.headers['x-github-token']
    if (customPat && typeof customPat === 'string' && customPat.trim().length > 5) {
      token = customPat.trim()
    }

    const refactorData = analysis.results?.refactor?.data || {}
    const scaffolds = refactorData.scaffolds || []
    const refactoredTarget = refactorData.refactoredTarget
    const targetPath = refactorData.target

    const filesToCommit = [...scaffolds]
    if (targetPath && refactoredTarget) {
      if (!filesToCommit.some((f) => f.path === targetPath)) {
        filesToCommit.push({
          path: targetPath,
          content: refactoredTarget,
        })
      }
    }

    filesToCommit.forEach((f) => {
      if (f.path.startsWith('/')) {
        f.path = f.path.substring(1)
      }
    })

    if (filesToCommit.length === 0) {
      return res.status(400).json({ error: 'No code changes found in this analysis to push to GitHub.' })
    }

    const rawPatch = refactorData.diff?.rawPatch || ''

    const result = await createPullRequest({
      owner: cleanOwner,
      repository: cleanRepo,
      defaultBranch: cleanBaseBranch,
      title: title || refactorData.pullRequestTitle,
      branch: cleanBranch,
      body,
      files: filesToCommit,
      baseFiles: analysis.files || [],
      policyFiles: analysis.policyFiles || [],
      patch: rawPatch,
      token,
      user,
      targetPath,
      refactoredTarget,
      confirmedHighRisk: Boolean(confirmedHighRisk),
      userId: authUser.userId || 'anonymous',
    })

    if (result.state === 'PR_BLOCKED') {
      return res.status(403).json(result)
    }

    if (!result.success) {
      return res.status(400).json(result)
    }

    res.json(result)
  } catch (error) {
    next(error)
  }
})

/**
 * Returns raw unified patch for an analysis.
 * Enforces ownership verification.
 */
prRouter.get('/pr/patch/:analysisId', prRateLimiter, async (req, res, next) => {
  try {
    const authUser = await resolveAuthenticatedUser(req)
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required to view patch.', code: 'UNAUTHORIZED' })
    }

    const { analysisId } = req.params
    const analysis = await getAnalysis(analysisId)
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found', code: 'NOT_FOUND' })
    }

    assertAnalysisOwnership(analysis, authUser)

    const rawPatch = analysis.results?.refactor?.data?.diff?.rawPatch || '# No diff available'
    const isDownload = req.query.download === 'true'

    if (isDownload) {
      res.setHeader('Content-Disposition', 'attachment; filename="codegenome-refactor.patch"')
      res.setHeader('Content-Type', 'text/x-diff; charset=utf-8')
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    }

    res.send(rawPatch)
  } catch (error) {
    next(error)
  }
})
