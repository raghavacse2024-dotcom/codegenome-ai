import JSZip from 'jszip'
import { Router } from 'express'
import { AnalysisIdSchema } from '../contracts.js'
import { getAnalysis } from '../services/analysisStore.js'

export const downloadRouter = Router()

downloadRouter.post('/download', async (request, response, next) => {
  try {
    const { analysisId } = AnalysisIdSchema.parse(request.body)
    const analysis = getAnalysis(analysisId)
    if (!analysis) throw Object.assign(new Error('Analysis not found. Run analysis again before downloading.'), { status: 404 })

    const zip = new JSZip()
    for (const file of analysis.results.refactor.data.scaffolds) {
      zip.file(file.path, file.content)
    }
    zip.file('README.md', `# CodeGenome Refactor Scaffold\n\nGenerated for ${analysis.repo.url}.\nMode: ${analysis.mode}.\n`)
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    response.setHeader('Content-Type', 'application/zip')
    response.setHeader('Content-Disposition', `attachment; filename="codegenome-refactor-${timestamp}.zip"`)
    response.send(buffer)
  } catch (error) {
    next(error)
  }
})
