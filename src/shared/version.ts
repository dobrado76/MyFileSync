/** Strip leading "v" and normalize semver-ish strings (e.g. 0.1 → 0.1.0). */
export function normalizeVersion(input: string): string {
  const trimmed = input.trim().replace(/^v/i, '')
  const parts = trimmed.split('.').map((p) => p.replace(/\D.*$/, ''))
  while (parts.length < 3) {
    parts.push('0')
  }
  return parts
    .slice(0, 3)
    .map((p) => String(parseInt(p, 10) || 0))
    .join('.')
}

export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  const a = normalizeVersion(left).split('.').map((n) => parseInt(n, 10))
  const b = normalizeVersion(right).split('.').map((n) => parseInt(n, 10))

  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff > 0) return 1
    if (diff < 0) return -1
  }
  return 0
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

/** Parse `MyFileSync-Setup-0.1.0.exe` → `0.1.0` */
export function parseInstallerFileName(fileName: string): string | null {
  const match = /^MyFileSync-Setup-(.+)\.exe$/i.exec(fileName)
  if (!match?.[1]) return null
  return normalizeVersion(match[1])
}

export function formatDisplayVersion(version: string): string {
  const normalized = normalizeVersion(version)
  const parts = normalized.split('.').map((n) => parseInt(n, 10))
  if ((parts[2] ?? 0) === 0) {
    return `v${parts[0]}.${parts[1]}`
  }
  return `v${normalized}`
}
