import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Client, type SFTPWrapper, type FileEntryWithStats, type Attributes } from 'ssh2'
import type { SftpConfig } from '@shared/schemas/job'
import { ioError, ok, type Result } from '@shared/result'

export type SftpEntry = {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export type SftpStat = {
  isDirectory: boolean
  size: number
  mtimeMs: number
}

function posixJoin(base: string, name: string): string {
  const normalized = base.replace(/\\/g, '/').replace(/\/+$/, '')
  return `${normalized}/${name}`
}

function toSftpStat(attrs: Attributes): SftpStat {
  return {
    isDirectory: (attrs.mode & 0o170000) === 0o040000,
    size: attrs.size ?? 0,
    mtimeMs: (attrs.mtime ?? 0) * 1000,
  }
}

function connectClient(config: SftpConfig): Promise<{ client: Client; sftp: SFTPWrapper }> {
  return new Promise((resolve, reject) => {
    const client = new Client()

    client.on('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end()
          reject(err)
          return
        }
        resolve({ client, sftp })
      })
    })

    client.on('error', (err) => {
      reject(err)
    })

    const connectOptions: Parameters<Client['connect']>[0] = {
      host: config.host,
      port: config.port ?? 22,
      username: config.username,
      readyTimeout: 20_000,
    }

    if (config.password) {
      connectOptions.password = config.password
    }
    if (config.privateKeyPath) {
      connectOptions.privateKey = fs.readFileSync(config.privateKeyPath)
    }

    client.connect(connectOptions)
  })
}

function promisify<T>(fn: (cb: (err: Error | null | undefined, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

/**
 * Basic SFTP provider — primary `$DATA` stream only; NTFS alternate streams are not supported (D13).
 */
export class SftpProvider {
  private client: Client | null = null
  private sftp: SFTPWrapper | null = null

  constructor(private readonly config: SftpConfig) {}

  async connect(): Promise<Result<void>> {
    try {
      const session = await connectClient(this.config)
      this.client = session.client
      this.sftp = session.sftp
      return ok(undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return ioError(`Could not connect to SFTP server "${this.config.host}": ${message}`)
    }
  }

  async disconnect(): Promise<void> {
    this.sftp = null
    if (this.client) {
      this.client.end()
      this.client = null
    }
  }

  private requireSftp(): SFTPWrapper {
    if (!this.sftp) {
      throw new Error('SFTP session is not connected.')
    }
    return this.sftp
  }

  async listDir(remotePath: string): Promise<Result<SftpEntry[]>> {
    try {
      const sftp = this.requireSftp()
      const entries = await promisify<FileEntryWithStats[]>((cb) => sftp.readdir(remotePath, cb))
      const listed: SftpEntry[] = entries
        .filter((entry) => entry.filename !== '.' && entry.filename !== '..')
        .map((entry) => ({
          name: entry.filename,
          path: posixJoin(remotePath, entry.filename),
          isDirectory: (entry.attrs.mode & 0o170000) === 0o040000,
          size: entry.attrs.size ?? 0,
          mtimeMs: (entry.attrs.mtime ?? 0) * 1000,
        }))
      return ok(listed)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return ioError(`Could not list SFTP folder "${remotePath}": ${message}`)
    }
  }

  async stat(remotePath: string): Promise<Result<SftpStat>> {
    try {
      const sftp = this.requireSftp()
      const attrs = await promisify<Attributes>((cb) => sftp.stat(remotePath, cb))
      return ok(toSftpStat(attrs))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return ioError(`Could not stat SFTP path "${remotePath}": ${message}`)
    }
  }

  /** Download the primary file stream to a local path. */
  async downloadFile(remotePath: string, localPath: string): Promise<Result<void>> {
    try {
      const sftp = this.requireSftp()
      await fsPromises.mkdir(path.dirname(localPath), { recursive: true })
      await promisify<void>((cb) => {
        sftp.fastGet(remotePath, localPath, (err) => cb(err ?? null, undefined))
      })
      return ok(undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return ioError(`Could not download "${remotePath}" from SFTP: ${message}`)
    }
  }

  /** Upload a local file as the primary stream on the remote path. */
  async uploadFile(localPath: string, remotePath: string): Promise<Result<void>> {
    try {
      const sftp = this.requireSftp()
      await promisify<void>((cb) => {
        sftp.fastPut(localPath, remotePath, (err) => cb(err ?? null, undefined))
      })
      return ok(undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return ioError(`Could not upload "${localPath}" to SFTP "${remotePath}": ${message}`)
    }
  }
}
