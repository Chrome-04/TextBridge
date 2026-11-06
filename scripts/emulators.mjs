import { spawn } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, join, delimiter } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const env = { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: '60' }
if (process.argv[2] === 'test') env.TEXTBRIDGE_TEST_RUN = '1'
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
const command =
  process.argv[2] === 'test'
    ? [
        'emulators:exec',
        '--only',
        'functions,firestore,storage',
        'node --test --test-concurrency=1 tests/backend/*.test.mjs && node node_modules/@playwright/test/cli.js test --config=playwright.firebase.config.ts',
      ]
    : [
        'emulators:start',
        '--only',
        'functions,firestore,storage',
        '--import=emulator-data',
        '--export-on-exit=emulator-data',
      ]
const child = spawn(
  join(root, 'node_modules/.bin/firebase'),
  [...command, '--project', 'demo-textbridge'],
  { cwd: root, env, stdio: 'inherit' },
)
child.on('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal))
