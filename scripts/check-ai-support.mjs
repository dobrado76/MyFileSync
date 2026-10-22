import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAiSupport, SOURCE_DOCS } from './build-ai-support.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

for (const rel of SOURCE_DOCS) {
  if (!fs.existsSync(path.join(root, rel))) errors.push(`Missing source ${rel}`)
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
if (!readme.includes('](AI-SUPPORT.md)') && !readme.includes('](./AI-SUPPORT.md)')) {
  errors.push('README.md is missing a Markdown link to AI-SUPPORT.md')
}
if (!/AI-assisted help|Ask an AI/i.test(readme)) {
  errors.push('README.md is missing the AI-assisted help section')
}

const expected = buildAiSupport()
const committedPath = path.join(root, 'AI-SUPPORT.md')
const committed = fs.existsSync(committedPath)
  ? fs.readFileSync(committedPath, 'utf8').replace(/\r\n/g, '\n')
  : ''

if (committed !== expected) {
  const tmp = path.join(os.tmpdir(), `myfilesync-ai-support-${process.pid}.md`)
  fs.writeFileSync(tmp, expected)
  errors.push(
    `AI-SUPPORT.md does not match the source docs. Run: npm run docs:build\nCompared against a fresh build (also written to ${tmp}).`,
  )
}

const bundled = expected
for (const rel of SOURCE_DOCS) {
  if (!bundled.includes(`<!-- source: ${rel} -->`)) {
    errors.push(`Bundle is missing source marker for ${rel}`)
  }
}

if (errors.length) {
  console.error(errors.join('\n\n'))
  process.exit(1)
}

console.log('docs:check ok')
