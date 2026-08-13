import fs from 'node:fs/promises'
import path from 'node:path'
import { jobSchema, type JobFile } from '@shared/schemas/job'
import { parseBatchFile } from '@shared/schemas/batch'
import { loadJob } from '../jobs/store'
import { runJobHeadless, type HeadlessRunOptions } from '../cli/runner'

export type BatchRunResult = {
  jobRef: string
  jobId: string
  ok: boolean
  error?: string
}

export type BatchRunSummary = {
  total: number
  succeeded: number
  failed: number
  results: BatchRunResult[]
}

async function resolveJob(ref: string): Promise<JobFile> {
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)

  if (uuidLike) {
    const loaded = await loadJob(ref)
    if (!loaded.ok) throw new Error(loaded.error.message)
    return loaded.value
  }

  const abs = path.resolve(ref)
  const raw = await fs.readFile(abs, 'utf8')
  return jobSchema.parse(JSON.parse(raw))
}

export async function runBatchFile(
  batchPath: string,
  options: HeadlessRunOptions = {},
): Promise<BatchRunSummary> {
  const raw = JSON.parse(await fs.readFile(path.resolve(batchPath), 'utf8')) as unknown
  const batch = parseBatchFile(raw)

  const results: BatchRunResult[] = []
  let succeeded = 0
  let failed = 0

  for (const jobRef of batch.jobs) {
    try {
      const job = await resolveJob(jobRef)
      const result = await runJobHeadless(job, options)
      if (result.ok) {
        succeeded++
        results.push({ jobRef, jobId: job.id, ok: true })
      } else {
        failed++
        results.push({ jobRef, jobId: job.id, ok: false, error: result.error })
        if (!batch.continueOnError) break
      }
    } catch (error) {
      failed++
      const message = error instanceof Error ? error.message : String(error)
      results.push({ jobRef, jobId: jobRef, ok: false, error: message })
      if (!batch.continueOnError) break
    }
  }

  return {
    total: batch.jobs.length,
    succeeded,
    failed,
    results,
  }
}

export async function runBatchRefs(
  refs: string[],
  options: HeadlessRunOptions = {},
): Promise<BatchRunSummary> {
  const batch = parseBatchFile(refs)
  const tempPath = path.join(process.cwd(), '.batch-temp.json')
  await fs.writeFile(tempPath, JSON.stringify(batch))
  try {
    return await runBatchFile(tempPath, options)
  } finally {
    await fs.rm(tempPath, { force: true })
  }
}
