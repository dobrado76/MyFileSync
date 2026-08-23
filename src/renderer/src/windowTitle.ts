const APP_WINDOW_TITLE = 'MyFileSync'

export function setAppWindowTitle(note?: string): void {
  const trimmed = note?.trim()
  document.title = trimmed ? `${APP_WINDOW_TITLE} — ${trimmed}` : APP_WINDOW_TITLE
}

export function resetAppWindowTitle(): void {
  setAppWindowTitle()
}
