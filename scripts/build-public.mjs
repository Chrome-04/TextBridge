import { build, loadEnv } from 'vite'
const config = {
  ...loadEnv('production', process.cwd(), 'VITE_'),
  ...process.env,
}
const required = [
  'VITE_SUPABASE_FUNCTION_URL',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_APPCHECK_SITE_KEY',
]
if (
  config.VITE_SHARE_STAGE !== 'live' ||
  config.VITE_SHARE_MODE !== 'supabase' ||
  required.some(
    (name) =>
      !config[name] ||
      config[name].startsWith('YOUR_') ||
      config[name].includes('YOUR_PROJECT'),
  )
) {
  console.error(
    'Public connection is not configured. Fill .env.production.local using .env.production.example first. No keys are displayed.',
  )
  process.exit(1)
}
const url = new URL(config.VITE_SUPABASE_FUNCTION_URL)
if (
  url.protocol !== 'https:' ||
  !url.hostname.endsWith('.supabase.co') ||
  url.pathname !== '/functions/v1/api' ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
)
  throw new Error('Invalid Supabase function URL.')
if (
  !['v3', 'enterprise'].includes(config.VITE_FIREBASE_APPCHECK_PROVIDER || '')
)
  throw new Error('Choose an App Check provider.')
await build({ mode: 'production' })
