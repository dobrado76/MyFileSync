/**
 * koffi / Win32 calls are not safe concurrently from multiple libuv threads.
 * Compare walks files in parallel — serialize native entry points.
 *
 * Use a waiter queue (not an unbounded Promise `.then` chain). A long chain of
 * already-resolved thens overflows the call stack on a large compare
 * ("Maximum call stack size exceeded"). Always resume the next waiter on a
 * macrotask so we never recurse through the queue synchronously.
 */
let held = false
const waiters: Array<() => void> = []

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function acquire(): Promise<void> {
  if (!held) {
    held = true
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => waiters.push(resolve))
}

function release(): void {
  const next = waiters.shift()
  if (next) {
    setImmediate(next)
    return
  }
  held = false
}

export async function withNativeLock<T>(fn: () => T | Promise<T>): Promise<T> {
  await acquire()
  try {
    return await fn()
  } finally {
    await yieldToEventLoop()
    release()
  }
}
