import { z } from 'zod'

/** Batch file entry: saved job UUID or absolute path to a `.json` job file. */
export const batchJobRefSchema = z.string().min(1)

export const batchSchema = z.object({
  format: z.literal('myfilesync-batch'),
  version: z.literal(1),
  /** Run in order; stop on first failure unless `continueOnError` is true. */
  jobs: z.array(batchJobRefSchema).min(1),
  continueOnError: z.boolean().default(false),
})

export type BatchFile = z.infer<typeof batchSchema>

/** Shorthand: bare JSON array of job refs (UUID or path). */
export const batchArraySchema = z.array(batchJobRefSchema).min(1)

export function parseBatchFile(raw: unknown): BatchFile {
  if (Array.isArray(raw)) {
    return batchSchema.parse({
      format: 'myfilesync-batch',
      version: 1,
      jobs: batchArraySchema.parse(raw),
      continueOnError: false,
    })
  }
  return batchSchema.parse(raw)
}
