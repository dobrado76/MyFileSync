import chokidar, { type FSWatcher } from 'chokidar'
import type { JobFile } from '@shared/schemas/job'
import { loadJob } from '../jobs/store'
import { runJobHeadless } from '../cli/runner'

type WatchEntry = {
  jobId: string
  watcher: FSWatcher
  debounceMs: number
  timer: ReturnType<typeof setTimeout> | null
  running: boolean
  pending: boolean
}

const watches = new Map<string, WatchEntry>()

function pairRoots(job: JobFile): string[] {
  return job.pairs.filter((p) => p.enabled).flatMap((p) => [p.left, p.right])
}

async function triggerSync(entry: WatchEntry): Promise<void> {
  if (entry.running) {
    entry.pending = true
    return
  }

  entry.running = true
  try {
    const loaded = await loadJob(entry.jobId)
    if (!loaded.ok) return
    await runJobHeadless(loaded.value, {
      onLog: (line) => console.log(`[watch:${entry.jobId}] ${line}`),
    })
  } finally {
    entry.running = false
    if (entry.pending) {
      entry.pending = false
      void triggerSync(entry)
    }
  }
}

function scheduleSync(entry: WatchEntry): void {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = null
    void triggerSync(entry)
  }, entry.debounceMs)
}

export async function startWatch(jobId: string): Promise<void> {
  if (watches.has(jobId)) return

  const loaded = await loadJob(jobId)
  if (!loaded.ok) throw new Error(loaded.error.message)

  const job = loaded.value
  if (!job.watch.enabled) return

  const roots = pairRoots(job).filter((r) => r.length > 0)
  if (roots.length === 0) return

  const watcher = chokidar.watch(roots, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: Math.min(job.watch.debounceMs, 500),
      pollInterval: 100,
    },
    depth: 99,
  })

  const entry: WatchEntry = {
    jobId,
    watcher,
    debounceMs: job.watch.debounceMs,
    timer: null,
    running: false,
    pending: false,
  }

  const onChange = (): void => scheduleSync(entry)
  watcher.on('add', onChange)
  watcher.on('change', onChange)
  watcher.on('unlink', onChange)
  watcher.on('addDir', onChange)
  watcher.on('unlinkDir', onChange)

  watches.set(jobId, entry)
}

export async function stopWatch(jobId: string): Promise<void> {
  const entry = watches.get(jobId)
  if (!entry) return

  if (entry.timer) clearTimeout(entry.timer)
  await entry.watcher.close()
  watches.delete(jobId)
}

export async function stopAllWatches(): Promise<void> {
  for (const jobId of [...watches.keys()]) {
    await stopWatch(jobId)
  }
}

export function isWatching(jobId: string): boolean {
  return watches.has(jobId)
}

export async function startWatchForEnabledJobs(): Promise<void> {
  const { listJobs } = await import('../jobs/store')
  const jobs = await listJobs()
  for (const summary of jobs) {
    const loaded = await loadJob(summary.id)
    if (loaded.ok && loaded.value.watch.enabled) {
      await startWatch(summary.id)
    }
  }
}
