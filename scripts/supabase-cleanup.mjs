import { readFile } from 'node:fs/promises'

const lines = (
  await readFile(new URL('../supabase/functions/.env', import.meta.url), 'utf8')
).split('\n')
const env = Object.fromEntries(
  lines
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    }),
)
if (env.TEXTBRIDGE_MODE !== 'local' || !env.TEXTBRIDGE_CLEANUP_SECRET)
  throw new Error('Local cleanup configuration is missing.')
const response = await fetch(
  'http://127.0.0.1:54321/functions/v1/api/cleanup',
  {
    method: 'POST',
    headers: { 'X-TextBridge-Cleanup': env.TEXTBRIDGE_CLEANUP_SECRET },
    signal: AbortSignal.timeout(60_000),
  },
)
if (!response.ok)
  throw new Error('Local cleanup unavailable; keep Supabase running.')
const result = await response.json()
console.log(
  `Removed ${result.removed} expired or orphaned payloads. Repeat for larger batches.`,
)
