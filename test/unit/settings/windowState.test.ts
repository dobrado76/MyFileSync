import { describe, expect, it } from 'vitest'
import { windowStateSchema } from '../../../src/main/settings/windowState'

describe('windowStateSchema', () => {
  it('accepts rounded integer bounds', () => {
    const state = windowStateSchema.parse({
      x: Math.round(120.4),
      y: Math.round(80.6),
      width: Math.max(400, Math.round(1280.2)),
      height: Math.max(300, Math.round(720.8)),
      isMaximized: true,
    })
    expect(state).toEqual({ x: 120, y: 81, width: 1280, height: 721, isMaximized: true })
  })
})
