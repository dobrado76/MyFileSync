export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes)
  if (abs < 1000) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = abs / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  const signed = bytes < 0 ? '-' : ''
  return `${signed}${value.toFixed(digits)} ${units[unit]}`
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatEta(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} hour${h === 1 ? '' : 's'} ${m} min`
  if (m > 0) return `${m} min ${s} s`
  return `${s} s`
}

export function formatByteRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/sec`
}

export function formatItemRate(itemsPerSec: number): string {
  if (itemsPerSec >= 100) return `${Math.round(itemsPerSec)} items/sec`
  return `${itemsPerSec.toFixed(1)} items/sec`
}
