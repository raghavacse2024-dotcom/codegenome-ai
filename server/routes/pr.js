import { Router } from 'express'
import { z } from 'zod'
import { getAnalysis } from '../services/analysisStore.js'
import { createPullRequest } from '../services/prService.js'
import { validateRefactor } from '../services/refactorValidator.js'
import { validatePrGuardrails } from '../services/prGuardrails.js'
import { resolveAuthenticatedUser, assertAnalysisOwnership, requireAuthenticatedUser } from '../services/authResolver.js'

export const prRouter = Router()

const CreatePrSchema = z.object({
  analysisId: z.string().min(1),
  title: z.string().optional(),
  branch: z.string().optional(),
  body: z.string().optional(),
  baseBranch: z.string().optional(),
  confirmedHighRisk: z.boolean().optional(),
})

/**
 * Validates a refactor package in sandbox without pushing changes.
 * Protected by analysis ownership verification.
 */
prRouter.post('/pr/validate', async (req, res, next) => {
  try {
    const authUser = resolveAuthenticatedUser(req)
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

    const guardrails = validatePrGuardrails({
      files: filesToValidate,
      patch: refactorData.diff?.rawPatch || '',
    })

    const validation = await validateRefactor({
      files: filesToValidate,
      targetPath,
      refactoredTarget,
    })

    res.json({
      guardrails,
      ...validation,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Creates an automated Pull Request for the refactor recommendation.
 * Requires authenticated user, verified analysis ownership, and authenticated GitHub credentials.
 */
prRouter.post('/pr/create', async (req, res, next) => {
  try {
    const authUser = resolveAuthenticatedUser(req)
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

    // Collect files to commit: new scaffolds + refactored target if applicable
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
      owner: repo.owner,
      repository: repo.repository,
      defaultBranch: baseBranch || repo.defaultBranch || 'main',
      title: title || refactorData.pullRequestTitle,
      branch,
      body,
      files: filesToCommit,
      patch: rawPatch,
      token,
      user,
      targetPath,
      refactoredTarget,
      confirmedHighRisk: Boolean(confirmedHighRisk),
    })

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
prRouter.get('/pr/patch/:analysisId', async (req, res, next) => {
  try {
    const authUser = resolveAuthenticatedUser(req)
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
