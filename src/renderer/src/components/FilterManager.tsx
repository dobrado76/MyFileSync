import { useState } from 'react'
import { classifyFilter, isAbsoluteFilterPath, relativeFilterFromAbs } from '@shared/compare/filters'

type FilterManagerProps = {
  title: string
  hint: string
  rules: string[]
  pairRoots: string[]
  onChange: (rules: string[]) => void
}

export function FilterManager({ title, hint, rules, pairRoots, onChange }: FilterManagerProps) {
  const [patternDraft, setPatternDraft] = useState('')
  const [pickError, setPickError] = useState<string | null>(null)
  const canPick = pairRoots.some((root) => root.trim().length > 0)

  function addRule(value: string): void {
    const next = value.trim()
    if (!next) return
    if (rules.includes(next)) return
    onChange([...rules, next])
  }

  function addPattern(): void {
    setPickError(null)
    let value = patternDraft.trim()
    if (!value) return
    if (isAbsoluteFilterPath(value)) {
      const relative = relativeFilterFromAbs(value, pairRoots)
      if (!relative) {
        setPickError('That path is not inside the source or target folder.')
        return
      }
      value = relative
    }
    addRule(value)
    setPatternDraft('')
  }

  async function addPicked(kind: 'folder' | 'file'): Promise<void> {
    setPickError(null)
    if (!canPick) {
      setPickError('Set the source and target folders first, then pick a path under them.')
      return
    }
    const picked =
      kind === 'folder'
        ? await window.myFileSync.pickFolder({ title: 'Choose a folder under the source or target' })
        : await window.myFileSync.pickFile({ title: 'Choose a file under the source or target' })
    if (!picked.ok || !picked.value.path) return
    const relative = relativeFilterFromAbs(picked.value.path, pairRoots)
    if (!relative) {
      setPickError('Pick a folder or file inside the source or target — rules are relative to the pair root.')
      return
    }
    addRule(relative)
  }

  function removeAt(index: number): void {
    onChange(rules.filter((_, i) => i !== index))
  }

  return (
    <section className="filter-manager">
      <h3 className="filter-manager-title">{title}</h3>
      <p className="settings-hint">{hint}</p>

      {rules.length === 0 ? (
        <p className="settings-hint">No rules yet.</p>
      ) : (
        <table className="filter-table">
          <thead>
            <tr>
              <th className="filter-col-type">Type</th>
              <th>Rule</th>
              <th className="filter-col-actions" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, index) => (
              <tr key={`${rule}-${index}`}>
                <td>
                  <span className={`filter-kind filter-kind-${classifyFilter(rule)}`}>
                    {classifyFilter(rule) === 'path' ? 'This path' : 'All instances'}
                  </span>
                </td>
                <td className="path-cell">{rule}</td>
                <td>
                  <button
                    type="button"
                    className="button button-sm"
                    title="Remove this rule"
                    onClick={() => removeAt(index)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="filter-add-row">
        <input
          className="settings-input"
          value={patternDraft}
          placeholder="All instances — e.g. !Thumbnails  or  *.tmp  or  **/.git/**"
          onChange={(e) => setPatternDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addPattern()
            }
          }}
        />
        <button type="button" className="button" onClick={addPattern}>
          Add pattern
        </button>
        <button type="button" className="button" disabled={!canPick} onClick={() => void addPicked('folder')}>
          This folder…
        </button>
        <button type="button" className="button" disabled={!canPick} onClick={() => void addPicked('file')}>
          This file…
        </button>
      </div>
      {pickError ? <p className="settings-hint filter-error">{pickError}</p> : null}
    </section>
  )
}
