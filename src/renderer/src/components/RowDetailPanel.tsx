import { useEffect, useState } from 'react'
import type { CompareRow } from '@shared/schemas/compare'

type RowDetailProps = {
  row: CompareRow | null
  onClose: () => void
}

export function RowDetailPanel({ row, onClose }: RowDetailProps) {
  const [preview, setPreview] = useState<string>('')
  const [previewStream, setPreviewStream] = useState<string>('')

  useEffect(() => {
    setPreview('')
    setPreviewStream('')
  }, [row?.id])

  if (!row) return null

  const streams = [
    ...(row.left?.adsManifest ?? []),
    ...(row.right?.adsManifest ?? []),
  ].filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i)

  async function loadPreview(hostPath: string | undefined, streamName: string): Promise<void> {
    if (!hostPath) return
    setPreviewStream(streamName)
    const result = await window.myFileSync.adsReadStream({ path: hostPath, streamName })
    if (result.ok) {
      setPreview(result.value.truncated ? `${result.value.text}\n\n… truncated` : result.value.text)
    } else {
      setPreview(result.error.message)
    }
  }

  return (
    <section className="row-detail-panel">
      <header className="row-detail-header">
        <h3>{row.relPath}</h3>
        <button type="button" className="button button-ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="row-detail-meta">
        {row.action} · {row.category} · ADS {row.adsDelta.equal ? 'equal' : 'diff'}
      </p>
      {streams.length > 0 ? (
        <table className="stream-table">
          <thead>
            <tr>
              <th>Stream</th>
              <th>Left</th>
              <th>Right</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {streams.map((s) => {
              const left = row.left?.adsManifest.find((e) => e.name === s.name)
              const right = row.right?.adsManifest.find((e) => e.name === s.name)
              return (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{left?.size ?? '—'}</td>
                  <td>{right?.size ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      onClick={() => void loadPreview(row.leftPath, s.name)}
                    >
                      Preview L
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="settings-hint">No alternate streams on this item.</p>
      )}
      {preview ? (
        <pre className="stream-preview">
          {previewStream}:{'\n'}
          {preview}
        </pre>
      ) : null}
    </section>
  )
}
