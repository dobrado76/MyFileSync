/** Characters forbidden in NTFS stream names (host path segment rules). */
const INVALID_STREAM_CHARS = /[<>:"/\\|?*]/

/** Primary data stream — excluded from ADS manifests. */
export const PRIMARY_STREAM_NAME = '::$DATA'

/** Win32 stream-path suffix (not the manifest name). */
const STREAM_PATH_SUFFIX = '$DATA'

export type AdsManifestEntry = {
  name: string
  size: number
  hash?: string
}

export type AdsManifest = AdsManifestEntry[]

/**
 * Validate an alternate stream name.
 * Returns a plain-language error message or null when valid.
 */
export function validateStreamName(name: string): string | null {
  if (!name || name.trim() === '') {
    return 'Stream name cannot be empty.'
  }
  if (name === PRIMARY_STREAM_NAME) {
    return 'Primary stream name is reserved.'
  }
  if (INVALID_STREAM_CHARS.test(name)) {
    return `Stream name contains invalid characters: ${name}`
  }
  return null
}

/**
 * Build the Win32 stream path form: `hostPath:streamName:$DATA`.
 * Applies `\\?\` long-path prefix to the host when needed.
 */
export function buildStreamPath(hostPath: string, streamName: string): string {
  const validation = validateStreamName(streamName)
  if (validation) {
    throw new Error(validation)
  }

  const host = toLongPath(hostPath)
  return `${host}:${streamName}:${STREAM_PATH_SUFFIX}`
}

/**
 * Prefix a Windows path with `\\?\` when it is long or already needs normalization.
 */
export function toLongPath(path: string): string {
  const normalized = path.replace(/\//g, '\\')

  if (normalized.startsWith('\\\\?\\')) {
    return normalized
  }

  if (normalized.startsWith('\\\\')) {
    // UNC: \\?\UNC\server\share\...
    return `\\\\?\\UNC\\${normalized.slice(2)}`
  }

  if (normalized.length >= 260) {
    return `\\\\?\\${normalized}`
  }

  return normalized
}

/**
 * Sort manifest entries by stream name for stable compare.
 */
export function sortManifest(manifest: AdsManifest): AdsManifest {
  return [...manifest].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Compare two manifests (names + sizes). Ignores hash.
 */
export function manifestsEqual(left: AdsManifest, right: AdsManifest): boolean {
  const l = sortManifest(left)
  const r = sortManifest(right)
  if (l.length !== r.length) return false
  return l.every((entry, i) => {
    const other = r[i]
    return other !== undefined && entry.name === other.name && entry.size === other.size
  })
}

/**
 * Normalize a stream name returned by FindFirstStreamW (`:name:$DATA` or `::$DATA`).
 */
export function normalizeListedStreamName(raw: string): string | null {
  const trimmed = raw.replace(/\0+$/, '')
  if (trimmed === PRIMARY_STREAM_NAME || trimmed === '$DATA') {
    return PRIMARY_STREAM_NAME
  }

  const match = /^:(.+):\$DATA$/.exec(trimmed)
  if (match?.[1]) {
    return match[1]
  }

  if (trimmed.endsWith(':$DATA')) {
    const base = trimmed.slice(0, -':$DATA'.length)
    return base.startsWith(':') ? base.slice(1) : base
  }

  return trimmed.length > 0 ? trimmed : null
}

/**
 * Strip the primary stream from a raw stream list returned by Win32 enumeration.
 */
export function toAdsManifest(
  streams: ReadonlyArray<{ name: string; size: number }>,
): AdsManifest {
  return sortManifest(
    streams
      .filter((s) => s.name !== PRIMARY_STREAM_NAME && s.name !== '$DATA')
      .map((s) => ({ name: s.name, size: s.size })),
  )
}
