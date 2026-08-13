import { describe, expect, it } from 'vitest'
import { convertFfsFilter, convertFfsFilterList } from '@shared/compare/ffsFilters'
import { shouldIncludePath } from '@shared/compare/filters'

describe('convertFfsFilter', () => {
  it('maps root folders and any-depth names', () => {
    expect(convertFfsFilter('\\System Volume Information\\')).toBe('/System Volume Information')
    expect(convertFfsFilter('\\ExploreSD\\Temp\\')).toBe('/ExploreSD/Temp')
    expect(convertFfsFilter('*\\desktop.ini')).toBe('desktop.ini')
    expect(convertFfsFilter('*\\thumbs.db')).toBe('thumbs.db')
    expect(convertFfsFilter('\\!Models triggers.txt')).toBe('/!Models triggers.txt')
    expect(convertFfsFilter('*.tmp')).toBe('*.tmp')
    expect(convertFfsFilter('*')).toBeNull()
  })

  it('matches like FreeFileSync after conversion', () => {
    const exclude = convertFfsFilterList([
      '\\venv\\',
      '*\\thumbs.db',
      '\\Stable-Diffusion-WebUI\\venv\\',
    ])
    expect(shouldIncludePath('venv/lib.py', [], exclude)).toBe(false)
    expect(shouldIncludePath('project/venv/lib.py', [], exclude)).toBe(true)
    expect(shouldIncludePath('foo/thumbs.db', [], exclude)).toBe(false)
    expect(shouldIncludePath('Stable-Diffusion-WebUI/venv/x.py', [], exclude)).toBe(false)
  })
})
