import JSZip from 'jszip'
import { Router } from 'express'
import { AnalysisIdSchema } from '../contracts.js'
import { getAnalysis } from '../services/analysisStore.js'

export const downloadRouter = Router()

async function handleDownload(rawId, request, response, next) {
  try {
    const parseResult = AnalysisIdSchema.safeParse({ analysisId: rawId })
    if (!parseResult.success) {
      return response.status(400).json({ error: 'Valid UUID analysisId is required.' })
    }
    const { analysisId } = parseResult.data
    const analysis = await getAnalysis(analysisId)
    if (!analysis) {
      return response.status(404).json({ error: 'Analysis not found. Run analysis again before downloading.' })
    }

    const zip = new JSZip()
    const scaffolds = analysis.results?.refactor?.data?.scaffolds || []
    for (const file of scaffolds) {
      if (file?.path && typeof file?.content === 'string') {
        zip.file(file.path, file.content)
      }
    }
    const repoUrl = analysis.repo?.url || 'Unknown'
    const target = analysis.results?.refactor?.data?.target || 'Codebase'
    const mode = analysis.mode || 'live'
    zip.file('README.md', `# CodeGenome Refactor Scaffold\n\nGenerated for ${repoUrl}.\nTarget File: ${target}\nMode: ${mode}.\nGenerated: ${analysis.createdAt || new Date().toISOString()}\n`)
    
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = (analysis.repo?.repository || 'refactor').replace(/[^a-zA-Z0-9_-]/g, '_')
    response.setHeader('Content-Type', 'application/zip')
    response.setHeader('Content-Disposition', `attachment; filename="codegenome-${safeName}-${timestamp}.zip"`)
    response.send(buffer)
  } catch (error) {
    next(error)
  }
}

// Support direct link / GET download by analysisId param
downloadRouter.get('/download/:analysisId', async (request, response, next) => {
  return handleDownload(request.params.analysisId, request, response, next)
})

// Support GET download by query parameter (?analysisId=...)
downloadRouter.get('/download', async (request, response, next) => {
  return handleDownload(request.query.analysisId, request, response, next)
})

// Support POST download with body payload ({ analysisId })
downloadRouter.post('/download', async (request, response, next) => {
  return handleDownload(request.body?.analysisId, request, response, next)
})

