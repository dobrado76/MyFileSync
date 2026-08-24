import { describe, expect, it } from 'vitest'
import { createDefaultJob } from '@shared/schemas/job'
import { parseFfsXml } from '../../../src/main/jobs/importFfs'
import { serializeFfsXml } from '../../../src/main/jobs/exportFfs'

describe('exportFfs', () => {
  it('round-trips pairs, mirror, recycle bin, and filters through import', () => {
    const job = createDefaultJob('Sites backup')
    job.pairs = [
      { id: 'a', left: 'F:\\Sites', right: 'Z:\\AI\\Backup\\Sites', enabled: true, ads: true },
      { id: 'b', left: 'F:\\AI\\LM Studio', right: 'Z:\\AI\\Backup\\LM Studio', enabled: true, ads: true },
    ]
    job.filters.exclude = ['/System Volume Information', 'thumbs.db', '/venv', '/Sites/secret']

    const exported = serializeFfsXml(job)
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    expect(exported.value.xml).toContain('<Notes/>')
    expect(exported.value.xml).toContain('<Errors Ignore="false" Retry="0" Delay="5"/>')
    expect(exported.value.xml).toContain('<EmailNotification Condition="Always"/>')
    expect(exported.value.xml).toContain('<GridViewType>Action</GridViewType>')

    const imported = parseFfsXml(exported.value.xml, 'Sites backup.ffs_gui')
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.value.job.variant).toBe('mirror')
    expect(imported.value.job.compare.useUsnJournal).toBe(true)
    expect(imported.value.job.delete.useRecycleBin).toBe(true)
    expect(imported.value.job.pairs).toHaveLength(2)
    expect(imported.value.job.pairs[0]?.left).toBe('F:\\Sites')
    expect(imported.value.job.pairs[1]?.right).toBe('Z:\\AI\\Backup\\LM Studio')
    expect(imported.value.job.filters.exclude).toEqual([
      '/System Volume Information',
      'thumbs.db',
      '/venv',
      '/Sites/secret',
    ])
  })

  it('exports Update and Two-way variants', () => {
    const update = createDefaultJob('upd')
    update.variant = 'update'
    update.pairs = [{ id: 'a', left: 'D:\\A', right: 'E:\\A', enabled: true, ads: true }]
    const updateXml = serializeFfsXml(update)
    expect(updateXml.ok).toBe(true)
    if (!updateXml.ok) return
    const updateIn = parseFfsXml(updateXml.value.xml, 'upd.ffs_gui')
    expect(updateIn.ok && updateIn.value.job.variant).toBe('update')

    const twoWay = createDefaultJob('tw')
    twoWay.variant = 'twoWay'
    twoWay.pairs = [{ id: 'a', left: 'D:\\A', right: 'E:\\A', enabled: true, ads: true }]
    const twoWayXml = serializeFfsXml(twoWay)
    expect(twoWayXml.ok).toBe(true)
    if (!twoWayXml.ok) return
    const twoWayIn = parseFfsXml(twoWayXml.value.xml, 'tw.ffs_gui')
    expect(twoWayIn.ok && twoWayIn.value.job.variant).toBe('twoWay')
  })

  it('rejects a job with no folder paths', () => {
    const job = createDefaultJob('empty')
    const exported = serializeFfsXml(job)
    expect(exported.ok).toBe(false)
  })
})
