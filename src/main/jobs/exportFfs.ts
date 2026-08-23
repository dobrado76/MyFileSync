import fs from 'node:fs/promises'
import path from 'node:path'
import { toFfsFilterList } from '@shared/compare/ffsFilters'
import { jobSchema, type JobFile, type JobPair } from '@shared/schemas/job'
import { ok, validationError, type Result } from '@shared/result'

export type FfsExportResult = {
  xml: string
  warnings: string[]
}

type SyncVariant = 'Mirror' | 'Update' | 'TwoWay'

function encodeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function itemsXml(items: string[], indent: string): string {
  if (items.length === 0) return `${indent}<Item>*</Item>`
  return items.map((item) => `${indent}<Item>${encodeXml(item)}</Item>`).join('\n')
}

function exportablePairs(pairs: JobPair[]): JobPair[] {
  return pairs.filter((pair) => pair.left.trim() || pair.right.trim())
}

function syncVariant(job: JobFile): { name: SyncVariant; warning?: string } {
  if (job.variant === 'update') return { name: 'Update' }
  if (job.variant === 'twoWay') return { name: 'TwoWay' }
  if (job.variant === 'automatic') {
    return { name: 'Mirror', warning: 'Automatic was exported as FreeFileSync Mirror. Review the variant.' }
  }
  return { name: 'Mirror' }
}

function changesXml(variant: SyncVariant): string {
  if (variant === 'Update') {
    return [
      '        <Changes>',
      '            <Left Create="right" Update="right" Delete="none"/>',
      '            <Right Create="none" Update="right" Delete="none"/>',
      '        </Changes>',
    ].join('\n')
  }
  if (variant === 'TwoWay') {
    return [
      '        <Changes>',
      '            <Left Create="left" Update="none" Delete="left"/>',
      '            <Right Create="right" Update="none" Delete="right"/>',
      '        </Changes>',
    ].join('\n')
  }
  return [
    '        <Changes>',
    '            <Left Create="right" Update="right" Delete="right"/>',
    '            <Right Create="right" Update="right" Delete="right"/>',
    '        </Changes>',
  ].join('\n')
}

function deletionXml(job: JobFile): { xml: string; warning?: string } {
  if (job.delete.useRecycleBin) {
    return {
      xml: [
        '        <DeletionPolicy>RecycleBin</DeletionPolicy>',
        '        <VersioningFolder Style="Replace"/>',
      ].join('\n'),
    }
  }
  if (job.versioning.enabled && job.versioning.folder.trim()) {
    return {
      xml: [
        '        <DeletionPolicy>Versioning</DeletionPolicy>',
        `        <VersioningFolder Style="Replace">${encodeXml(job.versioning.folder)}</VersioningFolder>`,
      ].join('\n'),
      warning:
        'MyFileSync overwrite versioning is not the same as FreeFileSync versioning-on-delete. Review Deletion policy in FreeFileSync.',
    }
  }
  return {
    xml: [
      '        <DeletionPolicy>Permanent</DeletionPolicy>',
      '        <VersioningFolder Style="Replace"/>',
    ].join('\n'),
  }
}

export function serializeFfsXml(job: unknown, xmlType: 'GUI' | 'BATCH' = 'GUI'): Result<FfsExportResult> {
  const parsed = jobSchema.safeParse(job)
  if (!parsed.success) return validationError('Job is not valid.', parsed.error.message)

  const pairs = exportablePairs(parsed.data.pairs)
  if (pairs.length === 0) {
    return validationError('Set at least one folder pair before exporting to FreeFileSync.')
  }

  const warnings: string[] = []
  const variant = syncVariant(parsed.data)
  if (variant.warning) warnings.push(variant.warning)

  const disabled = pairs.filter((pair) => !pair.enabled).length
  if (disabled > 0) {
    warnings.push(
      `${disabled} unticked pair${disabled === 1 ? '' : 's'} ${disabled === 1 ? 'was' : 'were'} still exported — FreeFileSync has no per-pair enable checkbox.`,
    )
  }

  const remote = pairs.some((pair) => pair.leftType === 'sftp' || pair.rightType === 'sftp')
  if (remote) {
    warnings.push('SFTP pairs were exported as path strings. FreeFileSync will not treat them as SFTP.')
  }

  const deletion = deletionXml(parsed.data)
  if (deletion.warning) warnings.push(deletion.warning)

  const include = toFfsFilterList(parsed.data.filters.include)
  const exclude = toFfsFilterList(parsed.data.filters.exclude)
  const skippedNegation = [...parsed.data.filters.include, ...parsed.data.filters.exclude].some((rule) =>
    rule.trim().startsWith('!'),
  )
  if (skippedNegation) {
    warnings.push('Gitignore negation filters (!) are not supported by FreeFileSync and were omitted.')
  }

  const compareVariant = parsed.data.compare.method === 'content' ? 'Content' : 'TimeAndSize'
  const pairXml = pairs
    .map(
      (pair) =>
        [
          '        <Pair>',
          `            <Left>${encodeXml(pair.left)}</Left>`,
          `            <Right>${encodeXml(pair.right)}</Right>`,
          '        </Pair>',
        ].join('\n'),
    )
    .join('\n')

  warnings.push('FreeFileSync does not sync NTFS alternate data streams — ADS settings were not exported.')

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<FreeFileSync XmlType="${xmlType}" XmlFormat="23">`,
    '    <Notes/>',
    '    <Compare>',
    `        <Variant>${compareVariant}</Variant>`,
    '        <Symlinks>Exclude</Symlinks>',
    '        <IgnoreTimeShift/>',
    '    </Compare>',
    '    <Synchronize>',
    changesXml(variant.name),
    deletion.xml,
    '    </Synchronize>',
    '    <Filter>',
    '        <Include>',
    itemsXml(include, '            '),
    '        </Include>',
    '        <Exclude>',
    itemsXml(exclude, '            '),
    '        </Exclude>',
    '        <SizeMin Unit="None">0</SizeMin>',
    '        <SizeMax Unit="None">0</SizeMax>',
    '        <TimeSpan Type="None">0</TimeSpan>',
    '    </Filter>',
    '    <FolderPairs>',
    pairXml,
    '    </FolderPairs>',
    '    <Errors Ignore="false" Retry="0" Delay="5"/>',
    '    <PostSyncCommand Condition="Completion"/>',
    '    <LogFolder/>',
    '    <EmailNotification Condition="Always"/>',
    '    <GridViewType>Action</GridViewType>',
    '</FreeFileSync>',
    '',
  ].join('\n')

  return ok({ xml, warnings })
}

export function ffsXmlTypeForPath(filePath: string): 'GUI' | 'BATCH' {
  return filePath.toLowerCase().endsWith('.ffs_batch') ? 'BATCH' : 'GUI'
}

export async function exportFfs(job: unknown, filePath: string): Promise<Result<{ path: string; warnings: string[] }>> {
  const serialized = serializeFfsXml(job, ffsXmlTypeForPath(filePath))
  if (!serialized.ok) return serialized
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, serialized.value.xml, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return validationError(`Cannot write FreeFileSync file: ${message}`)
  }
  return ok({ path: filePath, warnings: serialized.value.warnings })
}
