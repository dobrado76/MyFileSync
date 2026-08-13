import { z } from 'zod'
import { settingsSchema } from './settings'
import { jobSchema } from './job'

export const appReadyResponseSchema = z.object({
  platform: z.enum([
    'aix',
    'android',
    'darwin',
    'freebsd',
    'haiku',
    'linux',
    'openbsd',
    'sunos',
    'win32',
    'cygwin',
    'netbsd',
  ]),
  version: z.string(),
})

export const pickFolderRequestSchema = z.object({
  title: z.string().optional(),
  defaultPath: z.string().optional(),
})

export const runUpdateRequestSchema = z.object({
  installerPath: z.string().min(1),
})

export const settingsSetRequestSchema = settingsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one setting is required.',
)

export const settingsPathRequestSchema = z.object({
  path: z.string().min(1),
})

export const updateCheckResponseSchema = z.object({
  status: z.enum([
    'no-folder',
    'folder-missing',
    'no-installers',
    'up-to-date',
    'update-available',
  ]),
  folder: z.string().optional(),
  currentVersion: z.string().optional(),
  latestVersion: z.string().optional(),
  installerPath: z.string().optional(),
  latestInstallerPath: z.string().optional(),
})

export const adsListRequestSchema = z.object({
  path: z.string().min(1),
})

export const adsCopyRequestSchema = z.object({
  sourcePath: z.string().min(1),
  destPath: z.string().min(1),
  excludeStreams: z.array(z.string()).optional(),
})

export const adsReadStreamRequestSchema = z.object({
  path: z.string().min(1),
  streamName: z.string().min(1),
})

export const watchJobRequestSchema = z.object({ jobId: z.string().uuid() })

export const adsManifestEntrySchema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  hash: z.string().optional(),
})

export const adsManifestSchema = z.array(adsManifestEntrySchema)

export const pickFileRequestSchema = z.object({
  title: z.string().optional(),
  filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional(),
  defaultPath: z.string().optional(),
})

export const saveFileRequestSchema = pickFileRequestSchema

export const jobIdRequestSchema = z.object({ id: z.string().uuid() })

export const jobSaveRequestSchema = z.object({ job: jobSchema })

export const jobImportPathRequestSchema = z.object({ path: z.string().min(1) })

export const compareRunRequestSchema = z.object({
  jobId: z.string().uuid(),
})

export const compareGetRowsRequestSchema = z.object({
  runId: z.string().uuid(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(5000),
  filter: z
    .enum(['all', 'differences', 'leftOnly', 'rightOnly', 'adsDiff', 'errors'])
    .optional(),
})

export const compareCancelRequestSchema = z.object({ runId: z.string().uuid() })

export const compareSetRowIncludedRequestSchema = z.object({
  runId: z.string().uuid(),
  rowId: z.string().uuid(),
  included: z.boolean(),
})

export const syncRunRequestSchema = z.object({
  jobId: z.string().uuid(),
  runId: z.string().uuid(),
})

export const syncCancelRequestSchema = z.object({ syncRunId: z.string().uuid() })

export const syncGetProgressRequestSchema = z.object({ syncRunId: z.string().uuid() })
