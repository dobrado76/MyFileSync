import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, settingsSchema } from '../../../src/shared/schemas/settings'

describe('settingsSchema', () => {
  it('defaults hardware acceleration on for existing settings files', () => {
    const parsed = settingsSchema.parse({ updatesFolder: 'D:\\updates' })
    expect(parsed.hardwareAcceleration).toBe(true)
    expect(parsed.updatesFolder).toBe('D:\\updates')
  })

  it('preserves an explicit GPU off setting', () => {
    const parsed = settingsSchema.parse({
      updatesFolder: '',
      hardwareAcceleration: false,
    })
    expect(parsed.hardwareAcceleration).toBe(false)
  })

  it('ships with GPU on', () => {
    expect(DEFAULT_SETTINGS.hardwareAcceleration).toBe(true)
  })

  it('defaults mirror-delete confirm on for existing settings files', () => {
    const parsed = settingsSchema.parse({ updatesFolder: '' })
    expect(parsed.confirmMirrorDeletes).toBe(true)
    expect(parsed.progressUiExpanded).toBe(true)
  })
})
