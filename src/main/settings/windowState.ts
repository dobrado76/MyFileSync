import { app, screen, type BrowserWindow } from 'electron'
import fs from 'node:fs'
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

function roundState(input: {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}): WindowState {
  return windowStateSchema.parse({
    x: Math.round(input.x),
    y: Math.round(input.y),
    width: Math.max(400, Math.round(input.width)),
    height: Math.max(300, Math.round(input.height)),
    isMaximized: input.isMaximized,
  })
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

export function loadWindowState(): WindowState | null {
  try {
    const raw = fs.readFileSync(windowStatePath(), 'utf8')
    return windowStateSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function captureWindowState(window: BrowserWindow, wasMaximized: boolean): WindowState | null {
  if (window.isDestroyed()) return null
  const bounds = window.getNormalBounds()
  const isMaximized = window.isMaximized() || (window.isMinimized() && wasMaximized)
  return roundState({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  })
}

export function saveWindowState(window: BrowserWindow, wasMaximized = window.isMaximized()): void {
  const state = captureWindowState(window, wasMaximized)
  if (!state) return
  const file = windowStatePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/** Restored size only. Call maximize after show() or Windows drops it. */
export function applyWindowBounds(window: BrowserWindow, state: WindowState): void {
  if (isWindowStateOnScreen(state)) {
    window.setBounds({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
    })
    return
  }
  window.setSize(state.width, state.height)
  window.center()
}

export function attachWindowStatePersistence(window: BrowserWindow, initial?: WindowState | null): void {
  let maximized = initial?.isMaximized ?? window.isMaximized()
  let timer: ReturnType<typeof setTimeout> | undefined

  const persist = (): void => {
    if (window.isDestroyed()) return
    if (window.isMaximized()) maximized = true
    else if (!window.isMinimized()) maximized = false
    saveWindowState(window, maximized)
  }

  const persistSoon = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, 250)
  }

  window.on('maximize', persist)
  window.on('unmaximize', persist)
  window.on('moved', persistSoon)
  window.on('resized', persistSoon)
  window.on('close', persist)
}
