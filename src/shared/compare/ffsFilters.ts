/**
 * Map a FreeFileSync include/exclude item to a MyFileSync gitignore-style rule.
 *
 * FFS: `\` = pair-root relative, trailing `\` = folder, `*\name` = that name at any depth.
 */
export function convertFfsFilter(item: string): string | null {
  let pattern = item.trim().replace(/\\/g, '/')
  if (!pattern || pattern === '*' || pattern === '**' || pattern === '**/*') return null

  const dirOnly = pattern.endsWith('/')
  if (dirOnly) pattern = pattern.replace(/\/+$/, '')
  if (!pattern) return null

  if (/^\*\/[^/]+$/.test(pattern)) {
    return pattern.slice(2)
  }

  if (pattern.startsWith('/')) return pattern
  if (!pattern.includes('/')) return pattern
  return `/${pattern}`
}

/** Map a MyFileSync gitignore-style rule back to a FreeFileSync include/exclude item. */
export function toFfsFilter(rule: string): string | null {
  const pattern = rule.trim().replace(/\\/g, '/')
  if (!pattern || pattern === '*' || pattern === '**' || pattern === '**/*') return null
  if (pattern.startsWith('!')) return null

  if (!pattern.includes('/')) {
    if (pattern.includes('*') || pattern.includes('?')) return pattern.replace(/\//g, '\\')
    return `*\\${pattern.replace(/\//g, '\\')}`
  }

  const rooted = pattern.startsWith('/') ? pattern.slice(1) : pattern
  const last = rooted.split('/').pop() ?? rooted
  const looksLikeFile = /[.*?]/.test(last)
  const ffs = `\\${rooted.replace(/\//g, '\\')}`
  return looksLikeFile ? ffs : `${ffs}\\`
}

export function toFfsFilterList(rules: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const rule of rules) {
    const converted = toFfsFilter(rule)
    if (!converted || seen.has(converted.toLowerCase())) continue
    seen.add(converted.toLowerCase())
    out.push(converted)
  }
  return out
}

export function convertFfsFilterList(items: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const converted = convertFfsFilter(item)
    if (!converted || seen.has(converted.toLowerCase())) continue
    seen.add(converted.toLowerCase())
    out.push(converted)
  }
  return out
}
