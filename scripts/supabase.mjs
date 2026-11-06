import { spawn, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  existsSync,
  writeFileSync,
  openSync,
  closeSync,
  chmodSync,
  statfsSync,
  symlinkSync,
} from 'node:fs'
import { resolve, join } from 'node:path'
import { randomBytes } from 'node:crypto'
const root = resolve(import.meta.dirname, '..')
// Native Postgres cannot launch from a runtime path containing spaces.
const local = resolve(root, '..', '.textbridge-supabase')
mkdirSync(local, { recursive: true, mode: 0o700 })
chmodSync(local, 0o700)
const localAlias = join(root, '.supabase-local')
if (!existsSync(localAlias)) symlinkSync(local, localAlias, 'dir')
const env = {
  ...process.env,
  SUPABASE_HOME: local,
  SUPABASE_TELEMETRY_DISABLED: '1',
}
const cli = join(root, 'node_modules/.bin/supabase')
const command = process.argv[2] || 'start'
if (!['start', 'stop', 'status', 'serve'].includes(command))
  throw new Error('This launcher supports local commands only.')
const secrets = join(root, 'supabase/functions/.env')
if (!existsSync(secrets))
  writeFileSync(
    secrets,
    `TEXTBRIDGE_MODE=local\nTEXTBRIDGE_RATE_SALT=${randomBytes(32).toString('hex')}\nTEXTBRIDGE_CLEANUP_SECRET=${randomBytes(32).toString('hex')}\n`,
    { mode: 0o600 },
  )
if (command === 'start') {
  const disk = statfsSync(local)
  if (disk.bavail * disk.bsize < 4 * 1024 ** 3) {
    console.error(
      'Local Supabase needs room to unpack its services. Free at least 4 GiB on this disk before retrying. Existing backend data is unchanged.',
    )
    process.exit(1)
  }
  const logPath = join(local, 'start.log')
  const log = openSync(logPath, 'w', 0o600)
  chmodSync(logPath, 0o600)
  const runtime =
    env.TEXTBRIDGE_SUPABASE_RUNTIME ||
    ((process.platform === 'darwin' && process.arch === 'arm64') ||
    process.platform === 'linux'
      ? 'native'
      : 'docker')
  const child = spawn(
    cli,
    [
      'start',
      '--runtime',
      runtime,
      '--exclude',
      'realtime,mail,analytics,pooler',
    ],
    { cwd: root, env, stdio: ['ignore', log, log] },
  )
  child.on('exit', (code) => {
    closeSync(log)
    if (code) {
      console.error(
        'Supabase could not start. Details are in ignored .supabase-local/start.log.',
      )
      process.exit(code)
    }
    console.log('Local Supabase is ready. Studio: http://127.0.0.1:54323')
    console.log('Starting the TextBridge API. Keep this terminal running.')
    serve()
  })
} else if (command === 'serve') serve()
else if (command === 'status') {
  const result = spawnSync(
    cli,
    ['status', '--env', '--output-format', 'json'],
    {
      cwd: root,
      env,
      encoding: 'utf8',
    },
  )
  let values = {}
  try {
    values = JSON.parse(result.stdout)
  } catch {
    /* incomplete status */
  }
  if (result.status || !values.DB_URL) {
    console.error('Local Supabase is not ready.')
    process.exit(1)
  }
  writeFileSync(
    join(local, 'status.env'),
    Object.entries(values)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  )
  console.log(
    'Local endpoints and credentials saved privately to .supabase-local/status.env.',
  )
} else {
  const child = spawn(cli, ['stop'], { cwd: root, env, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code || 0))
}
function serve() {
  const child = spawn(
    cli,
    ['functions', 'serve', 'api', '--env-file', secrets, '--no-verify-jwt'],
    { cwd: root, env, stdio: 'inherit' },
  )
  child.on('exit', (code) => process.exit(code || 0))
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
}
