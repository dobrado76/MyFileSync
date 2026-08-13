import { describe, expect, it } from 'vitest'
import { classifyPair, computeAdsDelta, computeStats, planAction, rowMatchesFilter } from '@shared/compare/classify'
import { createDefaultJob } from '@shared/schemas/job'
import type { SideRecord } from '@shared/schemas/compare'

const job = createDefaultJob('test')

function side(partial: Partial<SideRecord> & Pick<SideRecord, 'relPath'>): SideRecord {
  return {
    isDir: false,
    dataSize: 100,
    mtimeMs: 1000,
    adsManifest: [],
    ...partial,
  }
}

describe('classify', () => {
  it('detects equal rows', () => {
    const left = side({ relPath: 'a.txt' })
    const right = side({ relPath: 'a.txt' })
    const row = classifyPair('pair', 'a.txt', left, right, job)
    expect(row.category).toBe('equal')
    expect(row.action).toBe('Skip')
  })

  it('detects ADS-only diff', () => {
    const left = side({
      relPath: 'a.txt',
      adsManifest: [{ name: 'Zone.Identifier', size: 10 }],
    })
    const right = side({ relPath: 'a.txt' })
    const row = classifyPair('pair', 'a.txt', left, right, job)
    expect(row.category).toBe('adsDiff')
    expect(row.action).toBe('UpdateStreamsOnly')
  })

  it('plans mirror delete for right-only', () => {
    const action = planAction('rightOnly', 'mirror')
    expect(action.action).toBe('Delete')
  })

  it('matches the Deleted filter for mirror deletes', () => {
    const right = side({ relPath: 'gone.txt' })
    const row = classifyPair('pair', 'gone.txt', undefined, right, job)
    expect(row.action).toBe('Delete')
    expect(rowMatchesFilter(row, 'deleted')).toBe(true)
    expect(rowMatchesFilter(row, 'rightOnly')).toBe(true)
    expect(rowMatchesFilter(row, 'leftOnly')).toBe(false)
  })

  it('computes ads delta', () => {
    const delta = computeAdsDelta(
      [{ name: 'a', size: 1 }],
      [{ name: 'a', size: 1 }, { name: 'b', size: 2 }],
    )
    expect(delta.added).toBe(1)
    expect(delta.equal).toBe(false)
  })

  it('counts equals that were not stored as rows', () => {
    const left = side({ relPath: 'a.txt' })
    const right = side({ relPath: 'b.txt', dataSize: 200 })
    const row = classifyPair('pair', 'b.txt', left, right, job)
    const stats = computeStats([row], 12)
    expect(stats.equal).toBe(12)
    expect(stats.total).toBe(13)
  })
})
