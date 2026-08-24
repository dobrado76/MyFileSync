import { describe, expect, it } from 'vitest'
import { classifyPair, computeAdsDelta, computeStats, pairIsEqual, planAction, rowMatchesFilter } from '@shared/compare/classify'
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
    expect(pairIsEqual(left, right, job)).toBe(true)
  })

  it('pairIsEqual is false when one side is missing', () => {
    const left = side({ relPath: 'a.txt' })
    expect(pairIsEqual(left, undefined, job)).toBe(false)
    expect(pairIsEqual(undefined, left, job)).toBe(false)
  })

  it('ignores ADS when the pair has ads unchecked', () => {
    const offJob = createDefaultJob('ads-off')
    offJob.pairs = [{ id: 'pair', left: 'D:\\A', right: 'E:\\A', enabled: true, ads: false }]
    const left = side({
      relPath: 'a.txt',
      adsManifest: [{ name: 'parameters', size: 10 }],
    })
    const right = side({ relPath: 'a.txt' })
    const row = classifyPair('pair', 'a.txt', left, right, offJob)
    expect(row.category).toBe('equal')
    expect(row.action).toBe('Skip')
    expect(pairIsEqual(left, right, offJob, 'pair')).toBe(true)
  })

  it('detects ADS-only diff', () => {
    const left = side({
      relPath: 'a.txt',
      adsManifest: [{ name: 'parameters', size: 10 }],
    })
    const right = side({ relPath: 'a.txt' })
    const row = classifyPair('pair', 'a.txt', left, right, job)
    expect(row.category).toBe('adsDiff')
    expect(row.action).toBe('UpdateStreamsOnly')
  })

  it('ignores Zone.Identifier and compare-cache streams by default', () => {
    const left = side({
      relPath: 'a.txt',
      adsManifest: [
        { name: 'Zone.Identifier', size: 26 },
        { name: 'MD5', size: 40 },
      ],
    })
    const right = side({ relPath: 'a.txt' })
    const row = classifyPair('pair', 'a.txt', left, right, job)
    expect(row.category).toBe('equal')
    expect(row.action).toBe('Skip')
    expect(row.adsDelta.equal).toBe(true)
  })

  it('still flags a real stream when an ignored stream is also present', () => {
    const left = side({
      relPath: 'a.txt',
      adsManifest: [
        { name: 'Zone.Identifier', size: 26 },
        { name: 'parameters', size: 12 },
      ],
    })
    const right = side({
      relPath: 'a.txt',
      adsManifest: [{ name: 'Zone.Identifier', size: 26 }],
    })
    const row = classifyPair('pair', 'a.txt', left, right, job)
    expect(row.category).toBe('adsDiff')
    expect(row.adsDelta.removed).toBe(1)
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

  it('does not treat directory mtime as a file Update', () => {
    const left = side({ relPath: 'dir', isDir: true, dataSize: 0, mtimeMs: 1000 })
    const right = side({ relPath: 'dir', isDir: true, dataSize: 0, mtimeMs: 9999 })
    const row = classifyPair('pair', 'dir', left, right, job)
    expect(row.category).toBe('equal')
    expect(row.action).toBe('Skip')
  })

  it('flags directory ADS diffs as stream-only', () => {
    const left = side({
      relPath: 'dir',
      isDir: true,
      dataSize: 0,
      adsManifest: [{ name: 'notes', size: 4 }],
    })
    const right = side({ relPath: 'dir', isDir: true, dataSize: 0, mtimeMs: 9999 })
    const row = classifyPair('pair', 'dir', left, right, job)
    expect(row.category).toBe('adsDiff')
    expect(row.action).toBe('UpdateStreamsOnly')
  })

  it('uses TouchTime when size and ADS match but only mtime differs', () => {
    const touchJob = createDefaultJob('touch')
    touchJob.behavior.touchTimeWhenSizeMatches = true
    const left = side({ relPath: 'a.txt', mtimeMs: 1000 })
    const right = side({ relPath: 'a.txt', mtimeMs: 2000 })
    const row = classifyPair('pair', 'a.txt', left, right, touchJob)
    expect(row.action).toBe('TouchTime')
    expect(row.direction).toBe('leftToRight')
  })

  it('keeps Update when touch-time is off', () => {
    const job = createDefaultJob('no-touch')
    job.behavior.touchTimeWhenSizeMatches = false
    const left = side({ relPath: 'a.txt', mtimeMs: 1000 })
    const right = side({ relPath: 'a.txt', mtimeMs: 2000 })
    const row = classifyPair('pair', 'a.txt', left, right, job)
    expect(row.action).toBe('Update')
  })

  it('keeps Update when size differs even if touch-time is on', () => {
    const touchJob = createDefaultJob('touch')
    touchJob.behavior.touchTimeWhenSizeMatches = true
    const left = side({ relPath: 'a.txt', dataSize: 100, mtimeMs: 1000 })
    const right = side({ relPath: 'a.txt', dataSize: 200, mtimeMs: 2000 })
    const row = classifyPair('pair', 'a.txt', left, right, touchJob)
    expect(row.action).toBe('Update')
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
