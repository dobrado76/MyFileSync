import path from 'node:path'
import { classifyPair } from '@shared/compare/classify'
import { pairComparesAds, type JobFile, type JobPair } from '@shared/schemas/job'
import type { CompareRow, SideRecord } from '@shared/schemas/compare'
import { yieldToEventLoop } from '../win32/nativeLock'
import { walkSide } from './walk'

export type ComparePairInput = {
  pair: JobPair
  leftRecords: Map<string, SideRecord>
  rightRecords: Map<string, SideRecord>
}

export async function walkPair(
  pair: JobPair,
  job: JobFile,
  onProgress?: (side: 'left' | 'right', currentPath: string) => void,
  isCancelled?: () => boolean,
): Promise<ComparePairInput> {
  const hashContent = job.compare.method === 'content' && job.compare.contentHash !== 'none'
  const hashAlgorithm: 'md5' | 'sha256' =
    job.compare.contentHash === 'sha256' ? 'sha256' : 'md5'

  const sharedWalkOpts = {
    filters: job.filters,
    hashContent: hashContent && job.compare.contentHash !== 'none',
    hashAlgorithm,
    useAdsCache: job.compare.useAdsCache,
    writeCacheToAds: job.ads.writeCacheToAds,
    hashCacheStreamName: job.ads.cacheStreamNames.fileHash,
    fastFolderCompare: job.compare.fastFolderCompare,
    folderStatStreamNames: job.ads.cacheStreamNames.folderStats,
    archiveFlagScanOnly: job.behavior.archiveFlagScanOnly,
    listAds: pairComparesAds(pair),
    isCancelled,
  }

  const leftRecords = await walkSide({
    ...sharedWalkOpts,
    root: pair.left,
    otherRoot: pair.right,
    onProgress: (p) => onProgress?.('left', p),
  })
  if (isCancelled?.()) {
    return { pair, leftRecords, rightRecords: new Map() }
  }
  const rightRecords = await walkSide({
    ...sharedWalkOpts,
    root: pair.right,
    otherRoot: pair.left,
    onProgress: (p) => onProgress?.('right', p),
  })

  return { pair, leftRecords, rightRecords }
}

export function unionSortedRelPaths(
  left: Map<string, SideRecord>,
  right: Map<string, SideRecord>,
): string[] {
  const keys = new Set<string>()
  for (const key of left.keys()) keys.add(key)
  for (const key of right.keys()) keys.add(key)
  return Array.from(keys).sort()
}

export async function mergePairRows(input: ComparePairInput, job: JobFile): Promise<CompareRow[]> {
  const rows: CompareRow[] = []
  let i = 0
  for (const relPath of unionSortedRelPaths(input.leftRecords, input.rightRecords)) {
    const left = input.leftRecords.get(relPath)
    const right = input.rightRecords.get(relPath)
    const row = classifyPair(input.pair.id, relPath, left, right, job)
    row.leftPath = left ? path.join(input.pair.left, relPath) : undefined
    row.rightPath = right ? path.join(input.pair.right, relPath) : undefined
    rows.push(row)
    i++
    if (i % 2000 === 0) await yieldToEventLoop()
  }
  return rows
}
