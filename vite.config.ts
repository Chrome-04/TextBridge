import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const supabase =
    env.VITE_SHARE_MODE === 'supabase' ||
    process.env.VITE_SHARE_MODE === 'supabase'
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: supabase ? 'http://127.0.0.1:54321' : 'http://127.0.0.1:5001',
          rewrite: (path) =>
            path.replace(
              /^\/api/,
              supabase
                ? '/functions/v1/api'
                : '/demo-textbridge/us-central1/api',
            ),
        },
      },
      headers: { 'Cache-Control': 'no-store' },
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
      headers: { 'Cache-Control': 'no-store' },
    },
  }
})
