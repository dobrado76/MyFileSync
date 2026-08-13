import { describe, expect, it } from 'vitest'
import {
  SETTINGS_EXPORT_FORMAT,
  SETTINGS_EXPORT_VERSION,
} from '../../../src/main/settings/exportImport'

describe('settings export envelope', () => {
  it('uses the portable format constants', () => {
    expect(SETTINGS_EXPORT_FORMAT).toBe('myfilesync-settings')
    expect(SETTINGS_EXPORT_VERSION).toBe(1)
  })
})
