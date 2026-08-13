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
