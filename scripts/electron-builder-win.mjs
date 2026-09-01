import { spawn } from 'node:child_process'

/** Unsigned Windows installer — no cert discovery, no Authenticode. */
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
delete process.env.CSC_LINK
delete process.env.WIN_CSC_LINK

// Always --publish never: tag CI uploads via softprops/action-gh-release.
// Without this, electron-builder auto-publishes on a git tag and fails without GH_TOKEN.
const child = spawn('npx', ['electron-builder', '--win', '--publish', 'never'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
