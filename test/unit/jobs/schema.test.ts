import { describe, expect, it } from 'vitest'
import {
  createDefaultJob,
  enabledJobPairs,
  jobSchema,
  type JobFile,
} from '../../../src/shared/schemas/job'

describe('jobSchema ui', () => {
  it('defaults ui when omitted from an older job file', () => {
    const withoutUi: Partial<JobFile> = { ...createDefaultJob('old') }
    delete withoutUi.ui
    const parsed = jobSchema.parse(withoutUi)
    expect(parsed.ui).toEqual({})
  })

  it('round-trips pairListHeight', () => {
    const job = createDefaultJob('layout')
    job.ui = { pairListHeight: 220 }
    expect(jobSchema.parse(job).ui.pairListHeight).toBe(220)
  })
})

describe('enabledJobPairs', () => {
  it('omits unticked pairs from compare and sync', () => {
    const job = createDefaultJob('pairs')
    job.pairs = [
      { id: 'on', left: 'D:\\A', right: 'E:\\A', enabled: true },
      { id: 'off', left: 'D:\\B', right: 'E:\\B', enabled: false },
    ]
    expect(enabledJobPairs(job).map((p) => p.id)).toEqual(['on'])
  })
})
