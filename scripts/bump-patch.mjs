import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const raw = fs.readFileSync(packagePath, 'utf8')
const pkg = JSON.parse(raw)
const current = String(pkg.version ?? '')
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
if (!match) {
  throw new Error(`package.json version must be X.Y.Z (got ${JSON.stringify(current)})`)
}

const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
pkg.version = next
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`Bumped version ${current} → ${next}`)
