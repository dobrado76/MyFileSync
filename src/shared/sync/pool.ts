/** Run work with a fixed number of in-flight tasks. Order of completion is not guaranteed. */
export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  isCancelled: () => boolean,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let next = 0

  async function runWorker(): Promise<void> {
    while (true) {
      if (isCancelled()) return
      const index = next
      next += 1
      if (index >= items.length) return
      await worker(items[index]!)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()))
}
