import { Router } from 'express'
import { z } from 'zod'
import { getAnalysis } from '../services/analysisStore.js'
import { createPullRequest } from '../services/prService.js'
import { getStoredToken, getStoredUser } from './auth.js'

export const prRouter = Router()

const CreatePrSchema = z.object({
  analysisId: z.string().min(1),
  title: z.string().optional(),
  branch: z.string().optional(),
  body: z.string().optional(),
  baseBranch: z.string().optional(),
})

/**
 * Creates an automated Pull Request for the refactor recommendation.
 */
prRouter.post('/pr/create', async (req, res, next) => {
  try {
    const { analysisId, title, branch, body, baseBranch } = CreatePrSchema.parse(req.body)

    const analysis = await getAnalysis(analysisId)
    if (!analysis) {
      return res.status(404).json({ error: `Analysis with ID '${analysisId}' not found.` })
    }

    const repo = analysis.repo
    if (!repo?.owner || !repo?.repository) {
      return res.status(400).json({ error: 'Analysis record does not contain valid repository details.' })
    }

    // Resolve user auth token & user profile
    let token = null
    let user = null
    const authHeader = req.headers.authorization
    const customPat = req.headers['x-github-token']

    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice(7).trim()
      if (raw.startsWith('cg_')) {
        token = getStoredToken(raw)
        user = getStoredUser(raw)
      } else {
        token = raw
      }
    }
    if (customPat && typeof customPat === 'string' && customPat.trim().length > 5) {
      token = customPat.trim()
    }
    if (!token && process.env.GITHUB_TOKEN) {
      token = process.env.GITHUB_TOKEN.trim()
    }

    const refactorData = analysis.results?.refactor?.data || {}
    const scaffolds = refactorData.scaffolds || []
    const refactoredTarget = refactorData.refactoredTarget
    const targetPath = refactorData.target

    // Collect files to commit: new scaffolds + refactored target if applicable
    const filesToCommit = [...scaffolds]
    if (targetPath && refactoredTarget) {
      // Check if not already in scaffolds
      if (!filesToCommit.some((f) => f.path === targetPath)) {
        filesToCommit.push({
          path: targetPath,
          content: refactoredTarget,
        })
      }
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
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})

/**
 * Returns raw unified patch for an analysis.
 */
prRouter.get('/pr/patch/:analysisId', async (req, res, next) => {
  try {
    const { analysisId } = req.params
    const analysis = await getAnalysis(analysisId)
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' })
    }

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
