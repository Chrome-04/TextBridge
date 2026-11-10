import { spawn } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, join, delimiter } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const env = { ...process.env }
const tools = join(root, '.tools')
if (existsSync(tools)) {
  const java = readdirSync(tools).find(
    (name) => name.startsWith('jdk-') || name.startsWith('jre-'),
  )
  const home = java && join(tools, java, 'Contents', 'Home')
  if (home && existsSync(join(home, 'bin/java'))) {
    env.JAVA_HOME = home
    env.PATH = join(home, 'bin') + delimiter + env.PATH
  }
}
const test = process.argv[2] === 'test'
const args = test
  ? [
      'emulators:exec',
      'node --experimental-strip-types --test tests/notes-rules.mjs && node node_modules/@playwright/test/cli.js test --config=playwright.notes.config.ts',
    ]
  : [
      'emulators:start',
      '--import=notes-emulator-data',
      '--export-on-exit=notes-emulator-data',
    ]
const child = spawn(
  join(root, 'node_modules/.bin/firebase'),
  [
    ...args,
    '--only',
    'auth,firestore',
    '--config',
    'firebase.notes.local.json',
    '--project',
    'demo-textbridge',
  ],
  { cwd: root, env, stdio: 'inherit' },
)
child.on('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal))
