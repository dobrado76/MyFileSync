import path from 'node:path'
import { classifyPair } from '@shared/compare/classify'
import type { JobFile, JobPair } from '@shared/schemas/job'
import type { CompareRow, SideRecord } from '@shared/schemas/compare'
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
  const hashContent =
    job.compare.method === 'content' ||
    job.compare.hashWhenSizeOrTimeDiffers
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
    compareWorkers: job.parallelism.compareWorkers,
    isCancelled,
  }

  const [leftRecords, rightRecords] = await Promise.all([
    walkSide({
      ...sharedWalkOpts,
      root: pair.left,
      otherRoot: pair.right,
      onProgress: (p) => onProgress?.('left', p),
    }),
    walkSide({
      ...sharedWalkOpts,
      root: pair.right,
      otherRoot: pair.left,
      onProgress: (p) => onProgress?.('right', p),
    }),
  ])

  return { pair, leftRecords, rightRecords }
}

export function mergePairRows(input: ComparePairInput, job: JobFile): CompareRow[] {
  const relPaths = new Set<string>([
    ...input.leftRecords.keys(),
    ...input.rightRecords.keys(),
  ])

  const rows: CompareRow[] = []
  for (const relPath of [...relPaths].sort()) {
    const left = input.leftRecords.get(relPath)
    const right = input.rightRecords.get(relPath)
    const row = classifyPair(input.pair.id, relPath, left, right, job)
    row.leftPath = left ? path.join(input.pair.left, relPath) : undefined
    row.rightPath = right ? path.join(input.pair.right, relPath) : undefined
    rows.push(row)
  }
  return rows
}
