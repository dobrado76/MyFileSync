import { app } from 'electron'
import { loadSettingsSync } from './store'

/** Must run before `app.whenReady()`. A later Settings change waits for the next launch. */
export function applyHardwareAccelerationSetting(): void {
  if (loadSettingsSync().hardwareAcceleration) return
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
}
