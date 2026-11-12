import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
const values = Object.fromEntries(
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
  !values.DB_URL ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(values.DB_URL).hostname)
)
  throw new Error('This setup accepts only the local Supabase database.')
const sql = postgres(values.DB_URL, { max: 1, onnotice: () => {} })
try {
  await sql.begin(async (tx) => {
    const [state] =
      await tx`select to_regclass('textbridge_private.saved_files') as installed`
    if (state.installed) {
      console.log('Local saved-file storage already installed.')
      return
    }
    const content = await readFile(
      new URL(
        '../supabase/migrations/202611120001_saved_files.sql',
        import.meta.url,
      ),
      'utf8',
    )
    await tx.unsafe(content).simple()
    const [journal] =
      await tx`select to_regclass('supabase_migrations.schema_migrations') as installed`
    if (journal.installed)
      await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values('202611120001','saved_files',${[content]}) on conflict(version) do nothing`
    console.log(
      'Installed private saved-file storage in local Supabase. Existing data preserved.',
    )
  })
} finally {
  await sql.end()
}
