import { useEffect, useState } from 'react'

type StatusBarProps = {
  text: string
  showElapsed?: boolean
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}

export function StatusBar({ text, showElapsed = false }: StatusBarProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!showElapsed) {
      setStartedAt(null)
      return
    }
    setStartedAt(Date.now())
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [showElapsed])

  return (
    <footer className="status-bar" role="status" aria-live="polite">
      <span className="status-bar-text" title={text}>
        {text}
      </span>
      {showElapsed && startedAt ? (
        <span className="status-bar-elapsed">{formatElapsed(now - startedAt)}</span>
      ) : null}
    </footer>
  )
}
