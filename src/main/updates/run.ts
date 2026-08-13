import { app, shell } from 'electron'
import fs from 'node:fs/promises'
import { ioError, ok, type Result } from '@shared/result'
import { requireAbsolute } from '../security/paths'

export async function runInstaller(installerPath: string): Promise<Result<{ launched: true }>> {
  try {
    const resolved = requireAbsolute(installerPath)
    await fs.access(resolved)

    const errorMessage = await shell.openPath(resolved)
    if (errorMessage) {
      return ioError(`Could not launch installer: ${errorMessage}`)
    }

    setTimeout(() => {
      app.quit()
    }, 500)

    return ok({ launched: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Could not launch installer: ${message}`)
  }
}
