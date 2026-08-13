import { minimatch } from 'minimatch'
import path from 'node:path'

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/')
}

function basename(relPath: string): string {
  const parts = normalizeRelPath(relPath).split('/')
  return parts[parts.length - 1] ?? relPath
}

export function shouldIncludePath(
  relPath: string,
  include: string[],
  exclude: string[],
): boolean {
  const normalized = normalizeRelPath(relPath)
  const name = basename(normalized)

  if (include.length > 0) {
    const allowed = include.some((pattern) => matchPattern(normalized, name, pattern))
    if (!allowed) return false
  }

  if (exclude.some((pattern) => matchPattern(normalized, name, pattern))) {
    return false
  }

  return true
}

function matchPattern(relPath: string, name: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/')
  if (normalizedPattern.includes('/') || normalizedPattern.includes('\\')) {
    const full = path.posix.normalize(normalizedPattern)
    return minimatch(relPath, full, { dot: true, nocase: true })
  }
  return minimatch(name, normalizedPattern, { dot: true, nocase: true })
}
