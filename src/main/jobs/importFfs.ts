import fs from 'node:fs/promises'
import path from 'node:path'
import { convertFfsFilterList } from '@shared/compare/ffsFilters'
import { createDefaultJob, jobSchema, type JobFile } from '@shared/schemas/job'
import { validationError, ok, type Result } from '@shared/result'

export type FfsImportResult = {
  job: JobFile
  warnings: string[]
}

type SideActions = {
  create: string
  update: string
  delete: string
}

export function parseFfsXml(xml: string, sourceName: string): Result<FfsImportResult> {
  const trimmed = xml.replace(/^\uFEFF/, '').trim()
  if (!/<FreeFileSync\b/i.test(trimmed)) {
    return validationError('Not a FreeFileSync file.', 'Choose a .ffs_gui or .ffs_batch file.')
  }

  const warnings: string[] = []
  const job = createDefaultJob(jobNameFromFile(sourceName))

  const compareBlock = inner(trimmed, 'Compare') ?? ''
  const compareVariant = text(compareBlock, 'Variant')?.toLowerCase() ?? ''
  if (compareVariant === 'content') {
    warnings.push('FreeFileSync content-hash compare is not supported — using size + date/time.')
  } else if (compareVariant === 'size') {
    warnings.push('FreeFileSync Size-only compare is not supported — using size + date/time.')
  }

  const symlinks = text(compareBlock, 'Symlinks')
  if (symlinks && !/^exclude$/i.test(symlinks)) {
    warnings.push(`FreeFileSync symlink policy "${symlinks}" is not supported — symlinks are skipped.`)
  }

  const timeShift = inner(compareBlock, 'IgnoreTimeShift')
  if (timeShift?.trim()) {
    warnings.push('FreeFileSync IgnoreTimeShift is not applied.')
  }

  const syncBlock = inner(trimmed, 'Synchronize') ?? ''
  const syncVariant = text(syncBlock, 'Variant')
  const leftActions = sideActions(syncBlock, 'Left')
  const rightActions = sideActions(syncBlock, 'Right')
  const inferred = inferVariant(syncVariant, leftActions, rightActions)
  job.variant = inferred.variant
  if (inferred.warning) warnings.push(inferred.warning)

  const deletion = text(syncBlock, 'DeletionPolicy') ?? ''
  const versioningFolder = text(syncBlock, 'VersioningFolder')?.trim() ?? ''
  const versioningStyle = tagAttr(syncBlock, 'VersioningFolder', 'Style')
  if (/^recyclebin$/i.test(deletion)) {
    job.delete.useRecycleBin = true
  } else if (/^versioning$/i.test(deletion)) {
    job.delete.useRecycleBin = false
    if (versioningFolder) {
      job.versioning = {
        enabled: true,
        folder: versioningFolder,
        keepCount: 5,
      }
    }
    warnings.push(
      'FreeFileSync versioning-on-delete is not the same as MyFileSync overwrite versioning. Review the Versioning option.',
    )
  } else {
    job.delete.useRecycleBin = false
  }
  if (versioningFolder && !/^versioning$/i.test(deletion) && versioningStyle && versioningStyle !== 'Replace') {
    warnings.push(`FreeFileSync versioning style "${versioningStyle}" was not imported.`)
  }

  const filterBlock = inner(trimmed, 'Filter') ?? ''
  const includeItems = xmlItems(filterBlock, 'Include')
  const excludeItems = xmlItems(filterBlock, 'Exclude')
  job.filters.include = convertFfsFilterList(includeItems)
  job.filters.exclude = convertFfsFilterList(excludeItems)

  const sizeMin = text(filterBlock, 'SizeMin')
  const sizeMax = text(filterBlock, 'SizeMax')
  const timeSpan = text(filterBlock, 'TimeSpan')
  if (sizeMin && sizeMin !== '0') warnings.push('FreeFileSync minimum-size filter was not imported.')
  if (sizeMax && sizeMax !== '0') warnings.push('FreeFileSync maximum-size filter was not imported.')
  if (timeSpan && timeSpan !== '0') warnings.push('FreeFileSync time-span filter was not imported.')

  const pairsBlock = inner(trimmed, 'FolderPairs') ?? ''
  const pairs: JobFile['pairs'] = []
  for (const pairXml of blocks(pairsBlock, 'Pair')) {
    const left = text(pairXml, 'Left')?.trim() ?? ''
    const right = text(pairXml, 'Right')?.trim() ?? ''
    if (!left && !right) continue
    pairs.push({
      id: crypto.randomUUID(),
      left,
      right,
      enabled: true,
      ads: true,
    })
  }

  if (pairs.length === 0) {
    return validationError('No folder pairs found in the FreeFileSync file.')
  }

  job.pairs = pairs

  const postCmd = text(trimmed, 'PostSyncCommand')
  if (postCmd?.trim()) {
    warnings.push('FreeFileSync post-sync command was not imported.')
  }
  const logFolder = text(trimmed, 'LogFolder')
  if (logFolder?.trim()) {
    warnings.push('FreeFileSync log folder was not imported.')
  }

  warnings.push('FreeFileSync does not sync NTFS alternate data streams — MyFileSync will compare and copy ADS on NTFS.')

  return ok({ job: jobSchema.parse(job), warnings })
}

export async function importFfs(filePath: string): Promise<Result<FfsImportResult>> {
  let text: string
  try {
    text = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return validationError(`Cannot read FreeFileSync file: ${message}`)
  }
  return parseFfsXml(text, path.basename(filePath))
}

function jobNameFromFile(sourceName: string): string {
  const base = sourceName.replace(/\.(ffs_gui|ffs_batch|xml)$/i, '')
  return base.trim() || 'Imported FreeFileSync job'
}

function inferVariant(
  explicit: string | undefined,
  left: SideActions | undefined,
  right: SideActions | undefined,
): { variant: JobFile['variant']; warning?: string } {
  const named = explicit?.toLowerCase()
  if (named === 'mirror') return { variant: 'mirror' }
  if (named === 'update') return { variant: 'update' }
  if (named === 'twoway' || named === 'two-way') return { variant: 'twoWay' }

  if (left && right) {
    if (right.delete === 'none' && left.create === 'right') {
      return { variant: 'update' }
    }
    if (left.create === 'left' && right.create === 'right') {
      return { variant: 'twoWay' }
    }
    if (left.create === 'right' && (right.delete === 'right' || left.delete === 'right')) {
      return { variant: 'mirror' }
    }
    if (named === 'custom') {
      return {
        variant: 'mirror',
        warning: 'FreeFileSync custom sync rules were imported as Mirror. Review the variant.',
      }
    }
  }

  if (named === 'custom') {
    return {
      variant: 'mirror',
      warning: 'FreeFileSync custom sync rules were imported as Mirror. Review the variant.',
    }
  }

  return { variant: 'mirror' }
}

function sideActions(xml: string, tag: string): SideActions | undefined {
  const attrs = tagAttrMap(xml, tag)
  if (!attrs) return undefined
  return {
    create: (attrs['Create'] ?? 'none').toLowerCase(),
    update: (attrs['Update'] ?? 'none').toLowerCase(),
    delete: (attrs['Delete'] ?? 'none').toLowerCase(),
  }
}

function inner(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
  const match = re.exec(xml)
  return match?.[1]
}

function text(xml: string, tag: string): string | undefined {
  const raw = inner(xml, tag)
  if (raw === undefined) return undefined
  return decodeXml(raw.replace(/<[^>]+>/g, '').trim())
}

function xmlItems(xml: string, parentTag: string): string[] {
  const parent = inner(xml, parentTag)
  if (!parent) return []
  const items: string[] = []
  const re = /<Item>([\s\S]*?)<\/Item>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(parent))) {
    const value = match[1]
    if (value === undefined) continue
    items.push(decodeXml(value.trim()))
  }
  return items
}

function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  const out: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const body = match[1]
    if (body === undefined) continue
    out.push(body)
  }
  return out
}

function tagAttr(xml: string, tag: string, attr: string): string | undefined {
  return tagAttrMap(xml, tag)?.[attr]
}

function tagAttrMap(xml: string, tag: string): Record<string, string> | undefined {
  const re = new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'i')
  const match = re.exec(xml)
  const attrBlock = match?.[1]
  if (!attrBlock) return undefined
  const attrs: Record<string, string> = {}
  const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g
  let attrMatch: RegExpExecArray | null
  while ((attrMatch = attrRe.exec(attrBlock))) {
    const name = attrMatch[1]
    const value = attrMatch[2]
    if (!name || value === undefined) continue
    attrs[name] = decodeXml(value)
  }
  return attrs
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
