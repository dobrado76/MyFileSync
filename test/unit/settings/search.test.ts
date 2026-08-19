import { describe, expect, it } from 'vitest'
import { settingsMatch } from '../../../src/shared/settings/search'

describe('settingsMatch', () => {
  it('shows everything when the query is empty', () => {
    expect(settingsMatch('', 'Recycle Bin for deletes')).toBe(true)
    expect(settingsMatch('   ', 'Recycle Bin')).toBe(true)
  })

  it('requires every word to match', () => {
    const text = 'Write hash cache to ADS restore timestamps'
    expect(settingsMatch('hash ads', text)).toBe(true)
    expect(settingsMatch('recycle', text)).toBe(false)
    expect(settingsMatch('hash recycle', text)).toBe(false)
  })
})
