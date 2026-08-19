import { useEffect, useRef } from 'react'

type SettingsSearchFieldProps = {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}

export function SettingsSearchField({ value, onChange, autoFocus = true }: SettingsSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <label className="settings-search">
      <span className="visually-hidden">Search settings</span>
      <input
        ref={inputRef}
        className="settings-input settings-search-input"
        type="search"
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="Search settings"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
