import fs from 'node:fs/promises'
import { createDefaultJob, jobSchema, type JobFile } from '@shared/schemas/job'
import { validationError, ok, type Result } from '@shared/result'

const DIRECTORY_RE =
  /^Directory\s*=\s*(.+?)\s*-->\s*(.+?)\s*\[(Mirror|Update|Auto)\]\s*\+\s*\((True|False)\)\s*$/i

export type IniImportResult = {
  job: JobFile
  warnings: string[]
}

export async function importIni(filePath: string): Promise<Result<IniImportResult>> {
  let text: string
  try {
    text = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return validationError(`Cannot read INI: ${message}`)
  }

  const warnings: string[] = []
  const job = createDefaultJob('Imported BackupMirror job')
  job.name = `Imported ${filePath.split(/[/\\]/).pop() ?? 'job'}`

  const pairs: JobFile['pairs'] = []
  let variant: JobFile['variant'] = 'mirror'

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue

    const dirMatch = DIRECTORY_RE.exec(line)
    if (dirMatch) {
      const left = dirMatch[1]?.trim() ?? ''
      const right = dirMatch[2]?.trim() ?? ''
      const mode = dirMatch[3]?.toLowerCase()
      const enabled = (dirMatch[4]?.toLowerCase() ?? 'true') === 'true'
      variant =
        mode === 'update' ? 'update' : mode === 'auto' ? 'automatic' : 'mirror'
      pairs.push({
        id: crypto.randomUUID(),
        left,
        right,
        enabled,
      })
      continue
    }

    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()

    switch (key) {
      case 'DetectMoved':
        job.behavior.detectMovedRenamed = parseBool(value)
        break
      case 'AutoExpand':
        job.behavior.autoExpandCompareTree = parseBool(value)
        break
      case 'UseVolumeShadowCopy':
        job.vss.enabled = parseBool(value)
        break
      case 'AutoBackup':
        job.behavior.autoSyncAfterCompare = parseBool(value)
        break
      case 'FastCompare':
        job.compare.fastFolderCompare = parseBool(value)
        break
      case 'FileFilter':
        if (!job.filters.exclude.includes(value)) job.filters.exclude.push(value)
        break
      case 'FolderFilter':
        if (!job.filters.exclude.includes(value)) {
          job.filters.exclude.push(value)
          warnings.push(`FolderFilter imported as exclude entry: ${value}`)
        }
        break
      default:
        break
    }
  }

  if (pairs.length === 0) {
    return validationError('No Directory pairs found in INI.')
  }

  job.pairs = pairs
  job.variant = variant
  job.compare.useAdsCache = true
  job.compare.fastFolderCompare = true
  job.ads.writeCacheToAds = true
  job.delete.useRecycleBin = false
  warnings.push(
    'BackupMirror used permanent deletes — imported job has useRecycleBin=false. Consider enabling Recycle Bin in job settings.',
  )

  return ok({ job: jobSchema.parse(job), warnings })
}

function parseBool(value: string): boolean {
  return value.toLowerCase() === 'true'
}
