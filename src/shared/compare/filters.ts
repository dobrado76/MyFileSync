import { minimatch } from 'minimatch'

export type FilterKind = 'pattern' | 'path'

const globOpts = { dot: true, nocase: true, nonegate: true, nocomment: true } as const

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function isAbsoluteFilterPath(pattern: string): boolean {
  const trimmed = pattern.trim()
  if (!trimmed) return false
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) return true
  return false
}

/** Gitignore: no slash (or star-star slash) = any depth; leading slash or a relative path = this instance under the pair root. */
export function classifyFilter(line: string): FilterKind {
  const glob = normalizeSlashes(line.trim())
  if (!glob) return 'pattern'
  if (isAbsoluteFilterPath(glob)) return 'path'
  if (glob.startsWith('/')) return 'path'
  if (glob.startsWith('**/')) return 'pattern'
  if (!glob.includes('/')) return 'pattern'
  return 'path'
}

function basename(relPath: string): string {
  const parts = normalizeSlashes(relPath).split('/').filter(Boolean)
  return parts[parts.length - 1] ?? relPath
}

function pathSegments(relPath: string): string[] {
  return normalizeSlashes(relPath).split('/').filter(Boolean)
}

function isCommentOrEmpty(pattern: string): boolean {
  const trimmed = pattern.trim()
  return trimmed.length === 0 || trimmed.startsWith('#')
}

/**
 * Turn an absolute Windows path into a gitignore rule relative to a pair root.
 * Root-level items get a leading `/` so they stay a single instance, not every folder with that name.
 */
export function relativeFilterFromAbs(absPath: string, roots: string[]): string | null {
  const abs = stripTrailingSlash(normalizeSlashes(absPath.trim()))
  if (!abs) return null

  for (const root of roots) {
    const base = stripTrailingSlash(normalizeSlashes(root.trim()))
    if (!base) continue
    const absKey = abs.toLowerCase()
    const baseKey = base.toLowerCase()
    if (absKey === baseKey) return null
    if (!absKey.startsWith(baseKey + '/')) continue
    const rel = abs.slice(base.length + 1)
    if (!rel) return null
    return rel.includes('/') ? rel : '/' + rel
  }
  return null
}

function matchPattern(relPath: string, pattern: string): boolean {
  let glob = normalizeSlashes(pattern.trim())
  if (!glob || glob.startsWith('#')) return false

  const dirOnly = glob.endsWith('/')
  if (dirOnly) glob = stripTrailingSlash(glob)

  const anchored = glob.startsWith('/')
  if (anchored) glob = glob.slice(1)
  if (!glob) return false

  const rel = stripTrailingSlash(normalizeSlashes(relPath))
  const name = basename(rel)

  try {
    if (!anchored && !glob.includes('/')) {
      if (minimatch(name, glob, globOpts)) return true
      return pathSegments(rel).some((segment) => minimatch(segment, glob, globOpts))
    }

    if (minimatch(rel, glob, globOpts)) return true
    if (minimatch(rel, glob + '/**', globOpts)) return true
  } catch {
    return false
  }
  return false
}

function resolveRule(pattern: string, pairRoot?: string): string {
  if (!pairRoot || !isAbsoluteFilterPath(pattern)) return pattern
  return relativeFilterFromAbs(pattern, [pairRoot]) ?? pattern
}

/** BackupMirror skips any path containing `\$` or `\RECYCLER`. */
export function isSystemSkipPath(relPath: string): boolean {
  return relPath.replace(/\\/g, '/').split('/').some((part) => {
    if (!part) return false
    if (part.startsWith('$')) return true
    return part.toUpperCase() === 'RECYCLER'
  })
}

export function shouldIncludePath(
  relPath: string,
  include: string[],
  exclude: string[],
  pairRoot?: string,
): boolean {
  const normalized = normalizeSlashes(relPath)

  const includeRules = include.filter((p) => !isCommentOrEmpty(p)).map((p) => resolveRule(p, pairRoot))
  if (includeRules.length > 0) {
    const allowed = includeRules.some((pattern) => matchPattern(normalized, pattern))
    if (!allowed) return false
  }

  const excluded = exclude.some((pattern) => {
    if (isCommentOrEmpty(pattern)) return false
    return matchPattern(normalized, resolveRule(pattern, pairRoot))
  })

  return !excluded
}
