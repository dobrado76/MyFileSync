type StatusBarProps = {
  text: string
}

export function StatusBar({ text }: StatusBarProps) {
  return (
    <footer className="status-bar" role="status" aria-live="polite">
      <span className="status-bar-text">{text}</span>
    </footer>
  )
}
