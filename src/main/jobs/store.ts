import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { jobSchema, toJobSummary, type JobFile, type JobSummary } from '@shared/schemas/job'
import type { z } from 'zod'
import { validationError, ok, ioError, type Result } from '@shared/result'

function jobsDir(): string {
  return path.join(app.getPath('userData'), 'jobs')
}

function jobPath(id: string): string {
  return path.join(jobsDir(), `${id}.json`)
}

export async function listJobs(): Promise<JobSummary[]> {
  await fs.mkdir(jobsDir(), { recursive: true })
  const entries = await fs.readdir(jobsDir())
  const jobs: JobSummary[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const loaded = await loadJob(entry.replace(/\.json$/, ''))
    if (loaded.ok) jobs.push(toJobSummary(loaded.value))
  }

  return jobs.sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadJob(id: string): Promise<Result<JobFile>> {
  try {
    const raw = await fs.readFile(jobPath(id), 'utf8')
    return ok(jobSchema.parse(JSON.parse(raw)))
  } catch {
    return ioError(`Job not found: ${id}`)
  }
}

export async function saveJob(job: z.input<typeof jobSchema>): Promise<Result<JobFile>> {
  try {
    const parsed = jobSchema.parse(job)
    await fs.mkdir(jobsDir(), { recursive: true })
    await fs.writeFile(jobPath(parsed.id), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    return ok(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return validationError(message)
  }
}

export async function deleteJob(id: string): Promise<Result<{ ok: true }>> {
  try {
    await fs.unlink(jobPath(id))
    return ok({ ok: true })
  } catch {
    return ioError(`Job not found: ${id}`)
  }
}

export async function importJobJson(filePath: string): Promise<Result<JobFile>> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = jobSchema.parse(JSON.parse(raw))
    return saveJob(parsed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return validationError(`Invalid job file: ${message}`)
  }
}
