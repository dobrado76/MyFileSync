import { describe, expect, it } from 'vitest'
import { err, ioError, isOk, ok, unwrapOr, validationError } from '@shared/result'

describe('result', () => {
  it('ok wraps a value', () => {
    const result = ok(42)
    expect(result).toEqual({ ok: true, value: 42 })
    expect(isOk(result)).toBe(true)
  })

  it('err wraps an error envelope', () => {
    const result = err({ code: 'io', message: 'failed' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('io')
    }
  })

  it('helpers build typed errors', () => {
    const io = ioError('disk')
    expect(io.ok).toBe(false)
    if (!io.ok) expect(io.error.code).toBe('io')

    const validation = validationError('bad')
    expect(validation.ok).toBe(false)
    if (!validation.ok) expect(validation.error.code).toBe('validation')
  })

  it('unwrapOr returns fallback on error', () => {
    expect(unwrapOr(ok('yes'), 'no')).toBe('yes')
    expect(unwrapOr(err({ code: 'io', message: 'x' }), 'no')).toBe('no')
  })
})
