import { z } from 'zod'

export const pairEndpointTypeSchema = z.enum(['local', 'sftp'])

export const sftpConfigSchema = z
  .object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().min(1),
    password: z.string().optional(),
    privateKeyPath: z.string().optional(),
  })
  .refine((cfg) => Boolean(cfg.password || cfg.privateKeyPath), {
    message: 'SFTP requires a password or privateKeyPath.',
  })

export const jobPairSchema = z.object({
  id: z.string().min(1),
  left: z.string(),
  right: z.string(),
  leftType: pairEndpointTypeSchema.optional(),
  rightType: pairEndpointTypeSchema.optional(),
  leftSftp: sftpConfigSchema.optional(),
  rightSftp: sftpConfigSchema.optional(),
  enabled: z.boolean(),
  /** Compare and extra stream copy for this pair. Off skips ADS work (faster). Default on. */
  ads: z.boolean().default(true),
})

export const jobUiSchema = z.object({
  pairListHeight: z.number().int().min(40).max(4000).optional(),
})

export const jobSchema = z.object({
  format: z.literal('myfilesync-job'),
  version: z.literal(1),
  id: z.string().uuid(),
  name: z.string().min(1),
  pairs: z.array(jobPairSchema).min(1),
  ui: jobUiSchema.default({}),
  variant: z.enum(['mirror', 'update', 'automatic', 'twoWay']),
  compare: z.object({
    method: z.enum(['sizeAndTime', 'content']),
    contentHash: z.enum(['md5', 'sha256', 'none']),
    hashWhenSizeOrTimeDiffers: z.boolean(),
    useAdsCache: z.boolean(),
    fastFolderCompare: z.boolean(),
    useUsnJournal: z.boolean().default(true),
  }),
  ads: z.object({
    syncAllStreams: z.boolean(),
    excludeStreams: z.array(z.string()),
    writeCacheToAds: z.boolean(),
    cacheStreamNames: z.object({
      fileHash: z.string(),
      folderStats: z.array(z.string()),
    }),
  }),
  filters: z.object({
    include: z.array(z.string()),
    exclude: z.array(z.string()),
  }),
  delete: z.object({
    useRecycleBin: z.boolean(),
    confirmPermanentMulti: z.boolean(),
  }),
  vss: z.object({
    enabled: z.boolean(),
  }),
  behavior: z.object({
    verifyAfterCopy: z.boolean(),
    archiveFlagScanOnly: z.boolean().default(false),
  }),
  parallelism: z.object({
    compareWorkers: z.number().int().min(1).max(32),
    copyPerDevice: z.number().int().min(1).max(32),
  }),
  versioning: z
    .object({
      enabled: z.boolean(),
      folder: z.string(),
      keepCount: z.number().int().min(1),
    })
    .default({ enabled: false, folder: '.myfilesync-versions', keepCount: 5 }),
  watch: z
    .object({
      enabled: z.boolean(),
      debounceMs: z.number().int().min(100),
    })
    .default({ enabled: false, debounceMs: 2000 }),
  syncRules: z
    .array(
      z.object({
        id: z.string().min(1),
        pattern: z.string().min(1),
        action: z.enum(['include', 'exclude', 'forceMirror', 'forceUpdate']),
      }),
    )
    .default([]),
})

export type JobFile = z.infer<typeof jobSchema>
export type JobPair = z.infer<typeof jobPairSchema>
export type PairEndpointType = z.infer<typeof pairEndpointTypeSchema>
export type SftpConfig = z.infer<typeof sftpConfigSchema>

export type JobSummary = {
  id: string
  name: string
  variant: JobFile['variant']
  pairCount: number
  enabledPairCount: number
}

export function createDefaultJob(name = 'New job'): JobFile {
  return {
    format: 'myfilesync-job',
    version: 1,
    id: crypto.randomUUID(),
    name,
    pairs: [
      {
        id: crypto.randomUUID(),
        left: '',
        right: '',
        enabled: true,
        ads: true,
      },
    ],
    variant: 'mirror',
    compare: {
      method: 'sizeAndTime',
      contentHash: 'md5',
      hashWhenSizeOrTimeDiffers: true,
      useAdsCache: false,
      fastFolderCompare: false,
      useUsnJournal: true,
    },
    ads: {
      syncAllStreams: true,
      excludeStreams: ['Zone.Identifier'],
      writeCacheToAds: false,
      cacheStreamNames: {
        fileHash: 'MD5',
        folderStats: [
          'FileCount',
          'FolderCount',
          'FileTotCount',
          'FolderTotCount',
          'FileSize',
          'FolderSize',
        ],
      },
    },
    filters: {
      include: [],
      exclude: ['thumbs.db', 'desktop.ini', '*.tmp', '$RECYCLE.BIN', 'RECYCLER'],
    },
    delete: {
      useRecycleBin: true,
      confirmPermanentMulti: true,
    },
    vss: {
      enabled: false,
    },
    behavior: {
      verifyAfterCopy: false,
      archiveFlagScanOnly: false,
    },
    parallelism: {
      compareWorkers: 4,
      copyPerDevice: 6,
    },
    versioning: {
      enabled: false,
      folder: '.myfilesync-versions',
      keepCount: 5,
    },
    watch: {
      enabled: false,
      debounceMs: 2000,
    },
    syncRules: [],
    ui: {},
  }
}

export function enabledJobPairs(job: JobFile): JobPair[] {
  return job.pairs.filter((pair) => pair.enabled)
}

/** Missing `ads` on older in-memory pairs counts as on. */
export function pairComparesAds(pair: JobPair): boolean {
  return pair.ads !== false
}

export function toJobSummary(job: JobFile): JobSummary {
  return {
    id: job.id,
    name: job.name,
    variant: job.variant,
    pairCount: job.pairs.length,
    enabledPairCount: enabledJobPairs(job).length,
  }
}
