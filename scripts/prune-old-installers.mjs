import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const current = String(pkg.version ?? '')
const releaseDir = path.join(root, 'release')

if (!current || !fs.existsSync(releaseDir)) {
  process.exit(0)
}

const keep = new Set([
  `MyFileSync-Setup-${current}.exe`.toLowerCase(),
  `MyFileSync-Setup-${current}.exe.blockmap`.toLowerCase(),
])
const stale = /^MyFileSync-Setup-.+\.exe(\.blockmap)?$/i

for (const name of fs.readdirSync(releaseDir)) {
  if (!stale.test(name) || keep.has(name.toLowerCase())) continue
  fs.unlinkSync(path.join(releaseDir, name))
  console.log(`Removed ${name}`)
}
