import { describe, expect, it } from 'vitest'
import { parseFfsXml } from '../../../src/main/jobs/importFfs'

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<FreeFileSync XmlType="GUI" XmlFormat="23">
    <Compare>
        <Variant>TimeAndSize</Variant>
        <Symlinks>Exclude</Symlinks>
        <IgnoreTimeShift/>
    </Compare>
    <Synchronize>
        <Changes>
            <Left Create="right" Update="right" Delete="right"/>
            <Right Create="right" Update="right" Delete="right"/>
        </Changes>
        <DeletionPolicy>RecycleBin</DeletionPolicy>
        <VersioningFolder Style="Replace"/>
    </Synchronize>
    <Filter>
        <Include>
            <Item>*</Item>
        </Include>
        <Exclude>
            <Item>\\System Volume Information\\</Item>
            <Item>*\\thumbs.db</Item>
            <Item>\\venv\\</Item>
            <Item>\\Sites\\secret\\</Item>
        </Exclude>
        <SizeMin Unit="None">0</SizeMin>
        <SizeMax Unit="None">0</SizeMax>
        <TimeSpan Type="None">0</TimeSpan>
    </Filter>
    <FolderPairs>
        <Pair>
            <Left>F:\\Sites</Left>
            <Right>Z:\\AI\\Backup\\Sites</Right>
        </Pair>
        <Pair>
            <Left>F:\\AI\\LM Studio</Left>
            <Right>Z:\\AI\\Backup\\LM Studio</Right>
        </Pair>
    </FolderPairs>
    <PostSyncCommand Condition="Completion"/>
    <LogFolder/>
</FreeFileSync>
`

describe('importFfs', () => {
  it('imports pairs, mirror variant, recycle bin, and filters', () => {
    const result = parseFfsXml(SAMPLE, 'SyncSettings_AI_F_Z.ffs_gui')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { job } = result.value
    expect(job.name).toBe('SyncSettings_AI_F_Z')
    expect(job.variant).toBe('mirror')
    expect(job.compare.useUsnJournal).toBe(true)
    expect(job.delete.useRecycleBin).toBe(true)
    expect(job.pairs).toHaveLength(2)
    expect(job.pairs[0]?.left).toBe('F:\\Sites')
    expect(job.pairs[0]?.right).toBe('Z:\\AI\\Backup\\Sites')
    expect(job.pairs[1]?.left).toBe('F:\\AI\\LM Studio')
    expect(job.filters.include).toEqual([])
    expect(job.filters.exclude).toEqual([
      '/System Volume Information',
      'thumbs.db',
      '/venv',
      '/Sites/secret',
    ])
  })

  it('maps Update when right-side deletes are none', () => {
    const xml = SAMPLE.replace(
      '<Right Create="right" Update="right" Delete="right"/>',
      '<Right Create="none" Update="right" Delete="none"/>',
    )
    const result = parseFfsXml(xml, 'update.ffs_gui')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.job.variant).toBe('update')
  })

  it('rejects files that are not FreeFileSync XML', () => {
    const result = parseFfsXml('<not-ffs/>', 'x.ffs_gui')
    expect(result.ok).toBe(false)
  })
})
