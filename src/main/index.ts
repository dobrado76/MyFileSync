import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc } from './ipc/register'
import { parseCliArgs, runCli } from './cli/runner'
import {
  applyWindowState,
  DEFAULT_WINDOW_STATE,
  loadWindowState,
  saveWindowState,
} from './settings/windowState'
import { attachEditContextMenu } from './ui/editContextMenu'

const isDev = !app.isPackaged

app.setAppUserModelId('com.myfilesync.app')

function appIconPath(): string | undefined {
  const candidates = [
    join(process.cwd(), 'build/icon.ico'),
    join(__dirname, '../../build/icon.ico'),
    join(process.resourcesPath, 'icon.ico'),
  ]
  return candidates.find((file) => existsSync(file))
}

function isHeadlessCli(): boolean {
  const args = parseCliArgs(process.argv)
  return Boolean(args.run || args.batch)
}

function preloadPath(): string {
  const js = join(__dirname, '../preload/index.js')
  const mjs = join(__dirname, '../preload/index.mjs')
  if (existsSync(js)) return js
  if (existsSync(mjs)) return mjs
  return js
}

async function createWindow(): Promise<void> {
  const saved = await loadWindowState()
  const initial = saved ?? DEFAULT_WINDOW_STATE
  const iconFile = appIconPath()
  const icon = iconFile ? nativeImage.createFromPath(iconFile) : undefined
  const windowIcon = icon && !icon.isEmpty() ? icon : undefined

  const window = new BrowserWindow({
    x: saved ? initial.x : undefined,
    y: saved ? initial.y : undefined,
    width: initial.width,
    height: initial.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'MyFileSync',
    icon: windowIcon,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (windowIcon) {
    window.setIcon(windowIcon)
  }

  if (!saved) {
    window.center()
  } else {
    applyWindowState(window, initial)
  }

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('close', () => {
    void saveWindowState(window)
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  attachEditContextMenu(window)

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (isHeadlessCli()) {
    const code = await runCli(process.argv)
    app.quit()
    process.exit(code)
    return
  }

  registerIpc(app.getVersion())
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
