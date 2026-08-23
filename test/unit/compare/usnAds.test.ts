import { describe, expect, it } from 'vitest'
import {
  parseUsnAdsPayload,
  persistedPairToUsnAds,
  serializeUsnAdsPayload,
  usnAdsPayloadMatchesPair,
  usnAdsToPersistedPair,
} from '@shared/compare/usnAds'

const cursor = {
  volumeRoot: 'D:\\',
  journalId: '10',
  nextUsn: '500',
  volumeSerial: '1',
}

describe('usnAds', () => {
  it('round-trips payload and matches pair roots case-insensitively', () => {
    const payload = persistedPairToUsnAds('mirror::sizeAndTime', { left: 'D:\\Src', right: 'E:\\Dst' }, {
      left: cursor,
      right: { ...cursor, volumeRoot: 'E:\\' },
      outstanding: ['a.txt'],
    })
    const raw = serializeUsnAdsPayload(payload)
    const parsed = parseUsnAdsPayload(raw)
    expect(parsed).not.toBeNull()
    expect(
      usnAdsPayloadMatchesPair(parsed!, 'd:\\src\\', 'e:\\dst', 'mirror::sizeAndTime'),
    ).toBe(true)
    expect(usnAdsToPersistedPair(parsed!).outstanding).toEqual(['a.txt'])
  })

  it('rejects wrong filter or roots', () => {
    const payload = persistedPairToUsnAds('a', { left: 'D:\\x', right: 'E:\\y' }, {
      left: cursor,
      right: cursor,
      outstanding: [],
    })
    expect(usnAdsPayloadMatchesPair(payload, 'D:\\x', 'E:\\z', 'a')).toBe(false)
    expect(usnAdsPayloadMatchesPair(payload, 'D:\\x', 'E:\\y', 'b')).toBe(false)
  })
})
