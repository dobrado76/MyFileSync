import path from 'node:path'

/**
 * Require an absolute, normalized path. Rejects empty, relative, and traversal escapes.
 */
export function requireAbsolute(input: string): string {
  if (!input || input.trim() === '') {
    throw new Error('Path cannot be empty.')
  }

  const trimmed = input.trim()
  const isUnc = trimmed.startsWith('\\\\')
  const isLong = trimmed.startsWith('\\\\?\\')

  let resolved: string
  if (isUnc || isLong) {
    resolved = path.normalize(trimmed)
  } else if (path.isAbsolute(trimmed)) {
    resolved = path.normalize(trimmed)
  } else {
    throw new Error('Path must be absolute.')
  }

  if (containsTraversal(resolved, isUnc || isLong)) {
    throw new Error('Path cannot contain parent-directory segments.')
  }

  return resolved
}

function containsTraversal(resolved: string, isSpecial: boolean): boolean {
  const parts = resolved.split(/[/\\]/).filter(Boolean)
  if (parts.includes('..')) return true

  if (isSpecial) return false

  const normalized = path.normalize(resolved)
  return normalized !== resolved.replace(/[/\\]+$/, '')
}
