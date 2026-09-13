import { createPatch, structuredPatch } from 'diff'

/**
 * Parses raw diff hunk lines into typed line objects with line numbers.
 * @param {Array<{oldStart: number, oldLines: number, newStart: number, newLines: number, lines: string[]}>} hunks
 * @returns {Array<object>}
 */
function parseStructuredHunks(hunks) {
  return hunks.map((hunk) => {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart

    const parsedLines = hunk.lines.map((raw) => {
      const marker = raw[0]
      const text = raw.slice(1)

      if (marker === '+') {
        const item = {
          type: 'add',
          newLineNumber: newLine,
          content: text,
        }
        newLine++
        return item
      } else if (marker === '-') {
        const item = {
          type: 'del',
          oldLineNumber: oldLine,
          content: text,
        }
        oldLine++
        return item
      } else {
        const item = {
          type: 'normal',
          oldLineNumber: oldLine,
          newLineNumber: newLine,
          content: text,
        }
        oldLine++
        newLine++
        return item
      }
    })

    return {
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      lines: parsedLines,
    }
  })
}

/**
 * Creates a FileDiff object between old content and new content.
 * @param {string} filePath
 * @param {string} oldContent
 * @param {string} newContent
 * @param {'modified'|'added'|'deleted'} [status='modified']
 * @returns {object} FileDiff
 */
export function createFileDiff(filePath, oldContent = '', newContent = '', status = 'modified') {
  const oldHeader = status === 'added' ? '/dev/null' : `a/${filePath}`
  const newHeader = status === 'deleted' ? '/dev/null' : `b/${filePath}`

  const rawPatch = createPatch(filePath, oldContent, newContent, oldHeader, newHeader, {
    context: 3,
  })

  const patchData = structuredPatch(filePath, filePath, oldContent, newContent, oldHeader, newHeader, {
    context: 3,
  })

  let additions = 0
  let deletions = 0

  for (const hunk of patchData.hunks || []) {
    for (const line of hunk.lines || []) {
      if (line.startsWith('+')) additions++
      if (line.startsWith('-')) deletions++
    }
  }

  const hunks = parseStructuredHunks(patchData.hunks || [])

  return {
    path: filePath,
    status,
    oldContent,
    newContent,
    patch: rawPatch,
    additions,
    deletions,
    hunks,
  }
}

/**
 * Compiles a full RefactorGitDiff from target file changes and new scaffold files.
 * @param {{ path: string, content?: string }} targetFile
 * @param {string} refactoredTargetContent
 * @param {Array<{path: string, content: string}>} scaffolds
 * @returns {object} RefactorGitDiff
 */
export function buildRefactorGitDiff(targetFile, refactoredTargetContent, scaffolds = []) {
  const fileDiffs = []

  // 1. Diff for target file (Modified)
  if (targetFile?.path && refactoredTargetContent && targetFile.content !== refactoredTargetContent) {
    const oldContent = targetFile.content || '// Original source file\n'
    fileDiffs.push(createFileDiff(targetFile.path, oldContent, refactoredTargetContent, 'modified'))
  }

  // 2. Diff for each new scaffold file (Added)
  for (const scaffold of scaffolds) {
    fileDiffs.push(createFileDiff(scaffold.path, '', scaffold.content, 'added'))
  }

  const summary = {
    filesChanged: fileDiffs.length,
    additions: fileDiffs.reduce((acc, f) => acc + f.additions, 0),
    deletions: fileDiffs.reduce((acc, f) => acc + f.deletions, 0),
  }

  const rawPatch = fileDiffs.map((f) => f.patch).join('\n')

  return {
    summary,
    rawPatch,
    files: fileDiffs,
  }
}
