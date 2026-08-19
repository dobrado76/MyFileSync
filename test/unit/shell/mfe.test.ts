import { describe, expect, it } from 'vitest'
import { mfeRevealUri } from '../../../src/shared/shell/mfe'

describe('mfeRevealUri', () => {
  it('URL-encodes a Windows path for the reveal protocol', () => {
    expect(mfeRevealUri('D:\\Projects\\shot.png')).toBe(
      'mfe://reveal?path=D%3A%5CProjects%5Cshot.png',
    )
  })
})
