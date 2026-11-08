import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

// Use the real local extensions, but roll back all DDL, Vault values, and HTTP
// queue entries. pg_net sends queued requests only after commit; no request escapes.
const config = Object.fromEntries(
  (
    await readFile(
      new URL('../.supabase-local/status.env', import.meta.url),
      'utf8',
    )
  )
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]
    }),
)
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.DB_URL).hostname)
)
  throw new Error('Cleanup verification refuses remote databases.')
const sql = postgres(config.DB_URL, { max: 1, onnotice: () => {} })
const rollback = new Error('Verification rollback')
try {
  await sql.begin(async (tx) => {
    await tx
      .unsafe(
        await readFile(
          new URL('../supabase/deployment/cleanup.sql', import.meta.url),
          'utf8',
        ),
      )
      .simple()
    const [job] = await tx`
      select active, schedule, command from cron.job
      where jobname = 'textbridge-expired-payloads'
    `
    assert.equal(job.active, true)
    assert.equal(job.schedule, '* * * * *')
    assert.equal(job.command, 'select textbridge_private.request_cleanup();')
    // Override only within this rolled-back transaction, preserving existing secrets.
    await tx`delete from vault.secrets where name in
      ('textbridge_cleanup_url', 'textbridge_cleanup_secret')`
    const endpoint = 'https://cleanupcheck.supabase.co/functions/v1/api/cleanup'
    const secret = crypto.randomUUID()
    await tx`select vault.create_secret(${endpoint}, 'textbridge_cleanup_url')`
    await tx`select vault.create_secret(${secret}, 'textbridge_cleanup_secret')`
    const [request] =
      await tx`select textbridge_private.request_cleanup() as id`
    const [queued] = await tx`
      select url, headers, timeout_milliseconds from net.http_request_queue
      where id = ${request.id}
    `
    assert.equal(queued.url, endpoint)
    assert.equal(queued.headers['X-TextBridge-Cleanup'], secret)
    assert.equal(queued.timeout_milliseconds, 120000)
    const [permissions] = await tx`
      select
        has_function_privilege('anon', 'textbridge_private.request_cleanup()', 'execute') as anon_call,
        has_function_privilege('authenticated', 'textbridge_private.request_cleanup()', 'execute') as user_call,
        has_function_privilege('service_role', 'textbridge_private.request_cleanup()', 'execute') as backend_call,
        has_table_privilege('anon', 'textbridge_private.cleanup_requests', 'select') as anon_read
    `
    assert.deepEqual(permissions, {
      anon_call: false,
      user_call: false,
      backend_call: false,
      anon_read: false,
    })
    // Validate the operational queries against the actual extension schemas too.
    await tx
      .unsafe(
        await readFile(
          new URL('../supabase/deployment/cleanup-status.sql', import.meta.url),
          'utf8',
        ),
      )
      .simple()
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
  console.log(
    'Cleanup schedule, private Vault header, permissions, and status queries passed; all changes rolled back.',
  )
} finally {
  await sql.end()
}
