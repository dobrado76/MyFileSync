import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release')
const winUnpacked = path.join(releaseDir, 'win-unpacked')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function psQuote(value) {
  return value.replace(/'/g, "''")
}

function killImage(image) {
  try {
    execFileSync('taskkill', ['/F', '/IM', image, '/T'], { stdio: 'ignore' })
    console.log(`prepare-dist: stopped ${image}`)
  } catch {
    // not running
  }
}

function killBuildLockers() {
  if (process.platform !== 'win32') return

  // Do not taskkill MyFileSync.exe — the installed app in AppData is not this tree.
  // A MyFileSync launched from release/win-unpacked is stopped below by path.
  for (const image of ['7za.exe', '7z.exe', '7zFM.exe', '7zG.exe']) {
    killImage(image)
  }

  const release = psQuote(releaseDir)
  const project = psQuote(root)

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$roots = @('${release}')
$stopped = New-Object System.Collections.Generic.List[string]
Get-CimInstance Win32_Process | ForEach-Object {
  $exe = $_.ExecutablePath
  $cmd = $_.CommandLine
  $kill = $false
  foreach ($r in $roots) {
    if (($exe -and $exe.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) -or
        ($cmd -and $cmd.IndexOf($r, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) {
      $kill = $true
      break
    }
  }
  if (-not $kill -and $_.Name -eq 'node.exe' -and $cmd -and
      ($cmd.IndexOf('electron-builder', [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
       $cmd.IndexOf('app-builder', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -and
      $cmd.IndexOf('${project}', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
    $kill = $true
  }
  if ($kill) {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    [void]$stopped.Add(("{0} pid {1}" -f $_.Name, $_.ProcessId))
  }
}
$stopped | Select-Object -Unique
`

  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { encoding: 'utf8' },
    )
    for (const line of out.trim().split(/\r?\n/).filter(Boolean)) {
      console.log(`prepare-dist: stopped ${line}`)
    }
  } catch {
    // ignore
  }
}

function pruneStaleUnpacked(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  if (!fs.existsSync(releaseDir)) return
  const now = Date.now()
  for (const name of fs.readdirSync(releaseDir)) {
    if (!name.startsWith('win-unpacked.stale-')) continue
    const full = path.join(releaseDir, name)
    try {
      if (now - fs.statSync(full).mtimeMs > maxAgeMs) {
        fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
        console.log(`prepare-dist: removed old ${name}`)
      }
    } catch {
      // still locked
    }
  }
}

async function clearWinUnpacked() {
  if (!fs.existsSync(winUnpacked)) return

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      fs.rmSync(winUnpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
      if (!fs.existsSync(winUnpacked)) {
        console.log('prepare-dist: removed release/win-unpacked')
        return
      }
    } catch {
      // retry
    }
    killBuildLockers()
    await sleep(400 * attempt)
  }

  const stale = path.join(releaseDir, `win-unpacked.stale-${Date.now()}`)
  killBuildLockers()
  await sleep(800)
  try {
    fs.renameSync(winUnpacked, stale)
    console.log(`prepare-dist: renamed locked win-unpacked → ${path.basename(stale)}`)
    return
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('')
    console.error('prepare-dist: release/win-unpacked is still locked after stopping build processes.')
    console.error(message)
    console.error('')
    process.exit(1)
  }
}

killBuildLockers()
await sleep(600)
await clearWinUnpacked()
pruneStaleUnpacked()
