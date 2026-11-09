import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { secureCode } from '../supabase/functions/api/handler.ts'

// A real local database transaction; every synthetic change is rolled back.
const vars = Object.fromEntries(
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
  !vars.DB_URL ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(vars.DB_URL).hostname)
)
  throw new Error('Counter tests refuse remote databases.')

test('share count survives expiry and cleanup and counts each completed generation once', async () => {
  const sql = postgres(vars.DB_URL, { max: 1, onnotice: () => {} })
  const rollback = new Error('rollback synthetic counter records')
  try {
    await assert.rejects(
      sql.begin(async (tx) => {
        const stats = async () =>
          (await tx`select public.tb_share_stats() as stats`)[0].stats
        await tx`select singleton from textbridge_private.share_stats where singleton for update`
        const before = await stats()
        const baseline = BigInt(before.totalShares)
        const code = secureCode()
        const generation = crypto.randomUUID()
        await tx`select public.tb_reserve(${code}, ${generation}::uuid, 'text', '', 1, '5 minutes')`
        assert.equal(
          BigInt((await stats()).totalShares),
          baseline,
          'Pending upload must not count',
        )
        await tx`select public.tb_ready(${code}, ${crypto.randomUUID()}::uuid)`
        assert.equal(
          BigInt((await stats()).totalShares),
          baseline,
          'Wrong generation must not count',
        )
        await tx`select public.tb_ready(${code}, ${generation}::uuid)`
        await tx`select public.tb_ready(${code}, ${generation}::uuid)`
        assert.equal(
          BigInt((await stats()).totalShares),
          baseline + 1n,
          'Ready retry must not double count',
        )
        await tx`select public.tb_lookup(${code})`
        await tx`select public.tb_share_stats()`
        assert.equal(
          BigInt((await stats()).totalShares),
          baseline + 1n,
          'Reads must not count',
        )
        await tx`update textbridge_private.shares set expires_at=clock_timestamp()-interval '1 second' where generation=${generation}`
        await tx`select public.tb_cleanup_done(${generation}::uuid)`
        assert.equal(
          BigInt((await stats()).totalShares),
          baseline + 1n,
          'Cleanup must retain total',
        )
        const next = crypto.randomUUID()
        await tx`select public.tb_reserve(${code}, ${next}::uuid, 'file', 'synthetic.txt', 1, '5 minutes')`
        await tx`select public.tb_ready(${code}, ${next}::uuid)`
        assert.equal(
          BigInt((await stats()).totalShares),
          baseline + 2n,
          'Reused code with a new generation counts',
        )
        assert.equal((await stats()).startedAt, before.startedAt)
        const expired = crypto.randomUUID()
        const expiredCode = secureCode()
        await tx`select public.tb_reserve(${expiredCode}, ${expired}::uuid, 'text', '', 1, '5 minutes')`
        await tx`update textbridge_private.shares set expires_at=clock_timestamp()-interval '1 second' where generation=${expired}`
        const [ready] =
          await tx`select public.tb_ready(${expiredCode}, ${expired}::uuid) as ready`
        assert.equal(ready.ready, false)
        assert.equal(BigInt((await stats()).totalShares), baseline + 2n)
        await tx`update textbridge_private.share_stats set total_shares=9007199254740993 where singleton`
        assert.equal(
          (await stats()).totalShares,
          '9007199254740993',
          'Counts must retain bigint precision',
        )
        const [access] = await tx`select
        has_function_privilege('anon','public.tb_share_stats()','EXECUTE') as anon_rpc,
        has_function_privilege('authenticated','public.tb_share_stats()','EXECUTE') as guest_rpc,
        has_function_privilege('service_role','public.tb_share_stats()','EXECUTE') as backend_rpc,
        has_table_privilege('anon','textbridge_private.share_stats','SELECT') as anon_table,
        has_table_privilege('authenticated','textbridge_private.share_stats','UPDATE') as guest_write,
        has_table_privilege('service_role','textbridge_private.share_stats','UPDATE') as backend_write`
        assert.deepEqual(access, {
          anon_rpc: false,
          guest_rpc: false,
          backend_rpc: true,
          anon_table: false,
          guest_write: false,
          backend_write: false,
        })
        const client = 'c'.repeat(64)
        for (let i = 0; i < 30; i++) {
          const [limit] =
            await tx`select public.tb_limit(${client}, 'stats', 0) as allowed`
          assert.equal(limit.allowed, true)
        }
        const [limited] =
          await tx`select public.tb_limit(${client}, 'stats', 0) as allowed`
        assert.equal(limited.allowed, false)
        const [create] =
          await tx`select public.tb_limit(${client}, 'create', 0) as allowed`
        assert.equal(
          create.allowed,
          true,
          'Reading statistics must not use the create allowance',
        )
        throw rollback
      }),
      (error) => error === rollback,
    )
  } finally {
    await sql.end()
  }
})
