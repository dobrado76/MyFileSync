import { describe, expect, it } from 'vitest'
import { withNativeLock } from '../../../src/main/win32/nativeLock'

describe('nativeLock', () => {
  it('runs callbacks one at a time', async () => {
    const order: number[] = []
    await Promise.all([
      withNativeLock(async () => {
        order.push(1)
        await new Promise((resolve) => setImmediate(resolve))
        order.push(2)
      }),
      withNativeLock(() => {
        order.push(3)
      }),
    ])
    expect(order).toEqual([1, 2, 3])
  })

  it('does not overflow the stack on a long compare-sized queue', async () => {
    let n = 0
    const tasks = Array.from({ length: 4000 }, () =>
      withNativeLock(() => {
        n++
      }),
    )
    await Promise.all(tasks)
    expect(n).toBe(4000)
  })
})
