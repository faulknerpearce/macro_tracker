import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { productLookupPlugin } from './vite.productLookupPlugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', 'mcp-server', '.env') })

const REQUIRED_BUILD_VARS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const

export default defineConfig(({ command, mode }) => {
  // Fail the production build instead of shipping a bundle that can't reach Supabase.
  // Values come from Cloudflare build variables, CI env, or a local .env file.
  if (command === 'build') {
    const env = loadEnv(mode, __dirname, 'VITE_')
    const missing = REQUIRED_BUILD_VARS.filter((key) => !env[key] && !process.env[key])
    if (missing.length > 0) {
      throw new Error(
        `Missing build variables: ${missing.join(', ')}. Set them in Cloudflare (Workers & Pages > macro-tracker > Settings > Variables and Secrets) or in packages/web/.env.`,
      )
    }
  }
  return {
    plugins: [react(), tailwindcss(), productLookupPlugin()],
  }
})
