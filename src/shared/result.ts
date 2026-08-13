export type ErrCode =
  | 'validation'
  | 'not-found'
  | 'io'
  | 'busy'
  | 'not-allowed'
  | 'cancelled'
  | 'conflict'

export type AppError = {
  code: ErrCode
  message: string
  hint?: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<T = never>(error: AppError): Result<T> {
  return { ok: false, error }
}

export function ioError(message: string, hint?: string): Result<never> {
  return err({ code: 'io', message, hint })
}

export function busyError(message: string, hint?: string): Result<never> {
  return err({ code: 'busy', message, hint })
}

export function validationError(message: string, hint?: string): Result<never> {
  return err({ code: 'validation', message, hint })
}

export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok
}

export function unwrapOr<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback
}
