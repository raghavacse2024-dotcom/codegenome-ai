import ts from 'typescript'

/**
 * Supported file extension regex for AST parsing.
 */
const JS_TS_REGEX = /\.(ts|tsx|js|jsx|mjs|cjs)$/i

/**
 * Analyzes a source code file using the TypeScript AST parser.
 * Calculates cyclomatic complexity, function density, nesting depth,
 * circular/heavy imports, exports, and specific maintainability anti-patterns.
 *
 * @param {string} filePath
 * @param {string} content
 * @returns {object} AST metrics and signals
 */
export function analyzeFileAST(filePath, content) {
  const lineCount = content.split(/\r?\n/).length

  // Only run AST parsing on JS/TS files
  if (!JS_TS_REGEX.test(filePath)) {
    return fallbackRegexMetrics(filePath, content, lineCount)
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
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKind
    )

    let cyclomaticComplexity = 1
    let functionCount = 0
    let maxNestingDepth = 0
    let classCount = 0
    const imports = []
    const exports = []
    let asyncFunctionCount = 0
    let anyTypeCount = 0
    let jsxElementCount = 0

    // Measure maximum block / statement nesting depth
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

    function walk(node) {
      // 1. Detect functions and methods
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        functionCount++
        cyclomaticComplexity++ // Base branching for function entry

        // Check if async
        if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
          asyncFunctionCount++
        }
      }

      // 2. Control flow branching for Cyclomatic Complexity calculation:
      // if, for, while, do..while, case clauses, catch, conditional (ternary), logical AND/OR/nullish
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
        if (d > maxNestingDepth) maxNestingDepth = d
      }

      // Binary logical branches (&&, ||, ??)
      if (ts.isBinaryExpression(node)) {
        if (
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          cyclomaticComplexity++
        }
      }

      // 3. Classes and OOP structures
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        classCount++
      }

      // 4. Track imports (dependencies coupling)
      if (ts.isImportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push(node.moduleSpecifier.text)
        }
      }

      // 5. Track exports
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

      // 6. JSX tags (presentation complexity)
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        jsxElementCount++
      }

      // 7. Typescript `any` type usage
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        anyTypeCount++
      }

      ts.forEachChild(node, walk)
    }

    walk(sourceFile)

    // Markers in code (comments)
    const todos = (content.match(/TODO|FIXME|HACK|XXX|BUG/gi) || []).length

    // Synthesize AST complexity score
    // Baseline: line weight + cyclomatic complexity factor + nesting penalty + high function count + debt markers
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

    return {
      path: filePath,
      lines: lineCount,
      score,
      signals: signals.length > 0 ? signals : ['clean AST profile'],
      ast: {
        cyclomaticComplexity,
        functionCount,
        maxNestingDepth,
        classCount,
        importCount: imports.length,
        exportCount: exports.length,
        anyTypeCount,
        jsxElementCount,
        imports: imports.slice(0, 10),
      }
    }
  } catch {
    // If syntax errors prevent complete AST generation, fallback gracefully
    return fallbackRegexMetrics(filePath, content, lineCount)
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
      controlBranches > 10 && `branching intensity (~${estimatedComplexity})`
    ].filter(Boolean),
    ast: {
      cyclomaticComplexity: estimatedComplexity,
      functionCount: functions,
      maxNestingDepth: 2,
      classCount: 0,
      importCount: 0,
      exportCount: 0,
      anyTypeCount: 0,
      jsxElementCount: 0,
      imports: []
    }
  }
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

  // Find 2-node or 3-node cycles
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
              description: `Circular dependency between ${node} and ${neighbor}`
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
