import { app, screen, type BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

export const windowStateSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(400),
  height: z.number().int().min(300),
  isMaximized: z.boolean(),
})

export type WindowState = z.infer<typeof windowStateSchema>

export const DEFAULT_WINDOW_STATE: WindowState = {
  x: 0,
  y: 0,
  width: 1200,
  height: 800,
  isMaximized: false,
}

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

export function isWindowStateOnScreen(state: WindowState): boolean {
  const displays = screen.getAllDisplays()
  return displays.some((display) => {
    const area = display.workArea
    return (
      state.x + state.width > area.x &&
      state.x < area.x + area.width &&
      state.y + state.height > area.y &&
      state.y < area.y + area.height
    )
  })
}

export async function loadWindowState(): Promise<WindowState | null> {
  try {
    const raw = await fs.readFile(windowStatePath(), 'utf8')
    return windowStateSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function saveWindowState(window: BrowserWindow): Promise<void> {
  if (window.isMinimized()) window.restore()

  const isMaximized = window.isMaximized()
  const bounds = isMaximized ? window.getNormalBounds() : window.getBounds()
  const state = windowStateSchema.parse({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  })

  await fs.mkdir(path.dirname(windowStatePath()), { recursive: true })
  await fs.writeFile(windowStatePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function applyWindowState(window: BrowserWindow, state: WindowState): void {
  if (isWindowStateOnScreen(state)) {
    window.setBounds({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
    })
  } else {
    window.setSize(state.width, state.height)
    window.center()
  }

  if (state.isMaximized) {
    window.maximize()
  }
}
