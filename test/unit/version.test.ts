import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  formatDisplayVersion,
  isNewerVersion,
  normalizeVersion,
  parseInstallerFileName,
} from '@shared/version'

describe('version', () => {
  it('normalizes short semver strings', () => {
    expect(normalizeVersion('0.1')).toBe('0.1.0')
    expect(normalizeVersion('v0.2')).toBe('0.2.0')
  })

  it('compares versions', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1)
  })

  it('detects newer versions', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
  })

  it('parses installer filenames', () => {
    expect(parseInstallerFileName('MyFileSync-Setup-0.2.0.exe')).toBe('0.2.0')
    expect(parseInstallerFileName('myfilesync-setup-0.1.exe')).toBe('0.1.0')
    expect(parseInstallerFileName('other-setup.exe')).toBeNull()
  })

  it('formats display version', () => {
    expect(formatDisplayVersion('0.1.0')).toBe('v0.1')
    expect(formatDisplayVersion('0.1.1')).toBe('v0.1.1')
  })
})
