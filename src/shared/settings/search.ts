/** VS Code-style settings filter: every word must appear in the haystack. */
export function settingsMatch(query: string, ...blobs: string[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = blobs.join(' ').toLowerCase()
  return words.every((word) => hay.includes(word))
}
