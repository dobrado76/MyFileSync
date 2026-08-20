import { spawn } from 'node:child_process'

/** Unsigned Windows installer — no cert discovery, no Authenticode. */
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
delete process.env.CSC_LINK
delete process.env.WIN_CSC_LINK

const child = spawn('npx', ['electron-builder', '--win'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
