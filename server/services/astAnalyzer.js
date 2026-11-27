import ts from 'typescript'

/**
 * Supported file extension regex for AST parsing.
 */
const JS_TS_REGEX = /\.(ts|tsx|js|jsx|mjs|cjs)$/i

/**
 * Analyzes a source code file using the TypeScript AST parser.
 * Calculates cyclomatic complexity, function density, nesting depth,
 * per-function line ranges, circular/heavy imports, exports, and maintainability signals.
 *
 * @param {string} filePath
 * @param {string} content
 * @returns {object} AST metrics and signals
 */
export function analyzeFileAST(filePath, content) {
  const safeContent = typeof content === 'string' ? content : ''
  const lineCount = safeContent.split(/\r?\n/).length

  if (!JS_TS_REGEX.test(filePath)) {
    return fallbackRegexMetrics(filePath, safeContent, lineCount)
  }

  try {
    const isJsx = /\.(jsx|tsx)$/i.test(filePath)
    const scriptKind = filePath.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : filePath.endsWith('.ts')
      ? ts.ScriptKind.TS
      : isJsx
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.JS

    const sourceFile = ts.createSourceFile(
      filePath,
      safeContent,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    )

    let cyclomaticComplexity = 1
    let functionCount = 0
    let maxNestingDepth = 0
    let maxNestingLine = 1
    let classCount = 0
    const imports = []
    const exports = []
    const functionHotspots = []
    let asyncFunctionCount = 0
    let anyTypeCount = 0
    let jsxElementCount = 0

    function lineAt(pos) {
      return sourceFile.getLineAndCharacterOfPosition(pos).line + 1
    }

    function getDepth(node) {
      let depth = 0
      let curr = node.parent
      while (curr) {
        if (
          ts.isIfStatement(curr) ||
          ts.isForStatement(curr) ||
          ts.isForInStatement(curr) ||
          ts.isForOfStatement(curr) ||
          ts.isWhileStatement(curr) ||
          ts.isDoStatement(curr) ||
          ts.isSwitchStatement(curr) ||
          ts.isCatchClause(curr) ||
          ts.isTryStatement(curr)
        ) {
          depth++
        }
        curr = curr.parent
      }
      return depth
    }

    function computeNodeComplexity(fnNode) {
      let cc = 1
      function countBranch(sub) {
        if (
          ts.isIfStatement(sub) ||
          ts.isForStatement(sub) ||
          ts.isForInStatement(sub) ||
          ts.isForOfStatement(sub) ||
          ts.isWhileStatement(sub) ||
          ts.isDoStatement(sub) ||
          ts.isCaseClause(sub) ||
          ts.isCatchClause(sub) ||
          ts.isConditionalExpression(sub)
        ) {
          cc++
        } else if (
          ts.isBinaryExpression(sub) &&
          (sub.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            sub.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            sub.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
        ) {
          cc++
        }
        ts.forEachChild(sub, countBranch)
      }
      if (fnNode.body) countBranch(fnNode.body)
      return cc
    }

    function getFnName(node) {
      if (node.name && ts.isIdentifier(node.name)) return node.name.text
      if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        return node.parent.name.text
      }
      if (node.parent && ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) {
        return node.parent.name.text
      }
      return null
    }

    function walk(node) {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        functionCount++
        cyclomaticComplexity++

        const startLine = lineAt(node.getStart(sourceFile))
        const endLine = lineAt(node.getEnd())
        const name = getFnName(node)
        const fnComplexity = computeNodeComplexity(node)

        if (name || endLine - startLine >= 12) {
          functionHotspots.push({
            name: name || `anonymous@${startLine}`,
            startLine,
            endLine,
            lineSpan: endLine - startLine + 1,
            cyclomaticComplexity: fnComplexity,
          })
        }

        if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
          asyncFunctionCount++
        }
      }

      if (
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node) ||
        ts.isCaseClause(node) ||
        ts.isCatchClause(node) ||
        ts.isConditionalExpression(node)
      ) {
        cyclomaticComplexity++
        const d = getDepth(node)
        if (d > maxNestingDepth) {
          maxNestingDepth = d
          maxNestingLine = lineAt(node.getStart(sourceFile))
        }
      }

      if (ts.isBinaryExpression(node)) {
        if (
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          cyclomaticComplexity++
        }
      }

      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        classCount++
      }

      if (ts.isImportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push(node.moduleSpecifier.text)
        }
      }

      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        exports.push(node.getText(sourceFile).slice(0, 30))
      } else if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            exports.push(decl.name.getText(sourceFile))
          }
        } else if (ts.isFunctionDeclaration(node) && node.name) {
          exports.push(node.name.text)
        } else if (ts.isClassDeclaration(node) && node.name) {
          exports.push(node.name.text)
        }
      }

      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        jsxElementCount++
      }

      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        anyTypeCount++
      }

      ts.forEachChild(node, walk)
    }

    walk(sourceFile)

    const todos = (safeContent.match(/TODO|FIXME|HACK|XXX|BUG/gi) || []).length

    const complexityWeight = cyclomaticComplexity * 1.6
    const nestingPenalty = maxNestingDepth > 3 ? (maxNestingDepth - 3) * 6 : 0
    const markerWeight = todos * 6
    const lineWeight = lineCount / 8
    const couplingWeight = imports.length > 12 ? (imports.length - 12) * 2 : 0

    const rawScore = Math.round(complexityWeight + nestingPenalty + markerWeight + lineWeight + couplingWeight)
    const score = Math.min(100, Math.max(1, rawScore))

    const signals = []
    if (cyclomaticComplexity > 25) {
      signals.push(`high cyclomatic complexity (v(G)=${cyclomaticComplexity})`)
    } else if (cyclomaticComplexity > 12) {
      signals.push(`cyclomatic complexity v(G)=${cyclomaticComplexity}`)
    }

    if (maxNestingDepth >= 4) {
      signals.push(`deep nesting (depth ${maxNestingDepth})`)
    }

    if (functionCount > 10) {
      signals.push(`${functionCount} AST functions/methods`)
    }

    if (imports.length > 15) {
      signals.push(`high coupling (${imports.length} imports)`)
    }

    if (lineCount > 250) {
      signals.push(`large file (${lineCount} lines)`)
    }

    if (todos > 0) {
      signals.push(`${todos} TODO/FIXME marker${todos > 1 ? 's' : ''}`)
    }

    if (anyTypeCount > 5) {
      signals.push(`${anyTypeCount} loose 'any' types`)
    }

    functionHotspots.sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity || b.lineSpan - a.lineSpan)

    return {
      path: filePath,
      lines: lineCount,
      score,
      signals: signals.length > 0 ? signals : ['clean AST profile'],
      ast: {
        cyclomaticComplexity,
        functionCount,
        maxNestingDepth,
        maxNestingLine,
        classCount,
        importCount: imports.length,
        exportCount: exports.length,
        anyTypeCount,
        jsxElementCount,
        imports: imports.slice(0, 15),
        functionHotspots: functionHotspots.slice(0, 6),
      },
    }
  } catch {
    return fallbackRegexMetrics(filePath, safeContent, lineCount)
  }
}

function fallbackRegexMetrics(filePath, content, lineCount) {
  const todos = (content.match(/TODO|FIXME|HACK/gi) || []).length
  const functions = (content.match(/def\s+\w+|function\s+\w+|class\s+\w+|=>\s*\{/g) || []).length
  const controlBranches = (content.match(/\b(if|elif|else|for|while|switch|case|catch)\b/g) || []).length
  const estimatedComplexity = Math.max(1, controlBranches + 1)
  const score = Math.min(100, Math.round(lineCount / 8 + todos * 8 + Math.max(0, functions - 8) * 3 + controlBranches * 1.2))

  return {
    path: filePath,
    lines: lineCount,
    score,
    signals: [
      lineCount > 250 && 'large file',
      todos > 0 && `${todos} maintenance markers`,
      functions > 8 && 'high function density',
      controlBranches > 10 && `branching intensity (~${estimatedComplexity})`,
    ].filter(Boolean),
    ast: {
      cyclomaticComplexity: estimatedComplexity,
      functionCount: functions,
      maxNestingDepth: 2,
      maxNestingLine: 1,
      classCount: 0,
      importCount: 0,
      exportCount: 0,
      anyTypeCount: 0,
      jsxElementCount: 0,
      imports: [],
      functionHotspots: [],
    },
  }
}

/**
 * Detects duplicate multi-line code blocks (6+ normalized lines) across repository files.
 * @param {Array<{path: string, content: string}>} files
 * @returns {Array<{ fingerprint: string, lineCount: number, occurrences: Array<{ filePath: string, startLine: number, endLine: number }> }>}
 */
export function detectCodeDuplication(files = []) {
  const windowSize = 6
  const blockMap = new Map()

  for (const f of files) {
    if (!f?.path || typeof f.content !== 'string') continue
    const lines = f.content.split(/\r?\n/)
    if (lines.length < windowSize) continue

    for (let i = 0; i <= lines.length - windowSize; i++) {
      const normalized = lines
        .slice(i, i + windowSize)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('*') && !l.startsWith('import '))
      if (normalized.length < 4) continue
      const key = normalized.join('\n')
      if (key.length < 80) continue

      if (!blockMap.has(key)) {
        blockMap.set(key, [])
      }
      const list = blockMap.get(key)
      // Avoid overlapping duplicate reports inside the exact same lines
      const overlap = list.some((o) => o.filePath === f.path && Math.abs(o.startLine - (i + 1)) < windowSize)
      if (!overlap && list.length < 5) {
        list.push({
          filePath: f.path,
          startLine: i + 1,
          endLine: i + windowSize,
        })
      }
    }
  }

  const duplicates = []
  for (const [key, occurrences] of blockMap.entries()) {
    if (occurrences.length >= 2) {
      duplicates.push({
        fingerprint: key.split('\n')[0].slice(0, 72),
        lineCount: windowSize,
        occurrences,
      })
    }
  }

  return duplicates.slice(0, 8)
}

/**
 * Builds dependency graph & checks for circular import relationships between files.
 * @param {Array<{path: string, content: string}>} files
 * @returns {Array<{cycle: string[], description: string}>} detected circular dependencies
 */
export function detectCircularDependencies(files) {
  const fileMap = new Map()
  for (const f of files) {
    fileMap.set(normalizeModulePath(f.path), f)
  }

  const adj = new Map()

  for (const f of files) {
    if (!JS_TS_REGEX.test(f.path)) continue
    const normFrom = normalizeModulePath(f.path)
    const neighbors = []

    try {
      const sourceFile = ts.createSourceFile(f.path, f.content, ts.ScriptTarget.Latest, false)
      function visit(node) {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text
          if (specifier.startsWith('.')) {
            const resolved = resolveRelativePath(f.path, specifier)
            if (resolved) neighbors.push(resolved)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
    } catch {}

    adj.set(normFrom, neighbors)
  }

  const cycles = []
  const seenCycles = new Set()

  for (const [node, neighbors] of adj.entries()) {
    for (const neighbor of neighbors) {
      if (adj.has(neighbor)) {
        const neighborTargets = adj.get(neighbor) || []
        if (neighborTargets.includes(node)) {
          const key = [node, neighbor].sort().join('<->')
          if (!seenCycles.has(key)) {
            seenCycles.add(key)
            cycles.push({
              cycle: [node, neighbor],
              description: `Circular dependency between ${node} and ${neighbor}`,
            })
          }
        }
      }
    }
  }

  return cycles
}

function normalizeModulePath(p) {
  return p.replace(/\\/g, '/').replace(/\.[^/.]+$/, '')
}

function resolveRelativePath(currentFile, importPath) {
  const currentDirParts = currentFile.split('/').slice(0, -1)
  const importParts = importPath.split('/')

  for (const part of importParts) {
    if (part === '.') continue
    if (part === '..') {
      currentDirParts.pop()
    } else {
      currentDirParts.push(part)
    }
  }

  return currentDirParts.join('/')
}
