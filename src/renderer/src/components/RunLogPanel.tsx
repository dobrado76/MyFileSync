type RunLogPanelProps = {
  logs: Array<{ id: string; time: string; message: string; level: 'info' | 'error' | 'success' }>
}

export function RunLogPanel({ logs }: RunLogPanelProps) {
  return (
    <section className="run-log-panel">
      <h3 className="run-log-title">Run log</h3>
      <ul className="run-log-list">
        {logs.length === 0 ? (
          <li className="run-log-empty">No runs yet.</li>
        ) : (
          logs.map((entry) => (
            <li key={entry.id} className={`run-log-item run-log-${entry.level}`}>
              <span className="run-log-time">{entry.time}</span>
              <span>{entry.message}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
