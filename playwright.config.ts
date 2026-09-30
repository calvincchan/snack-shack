import { defineConfig, devices } from '@playwright/test'
import { LOCAL_ANON_KEY, LOCAL_API_URL } from './e2e/helpers/local-supabase'

export default defineConfig({
  testDir: './e2e',
  // The tests share one local Supabase, so they run one after another.
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  // Phone size: the app is for one-handed use at the table.
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // Always rebuild: reusing a server left over from the last run serves the
    // previous bundle, and the failures make no sense.
    reuseExistingServer: false,
    // Vite's preview server ignores the polite signal, so don't wait long.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
    env: {
      VITE_SUPABASE_URL: LOCAL_API_URL,
      VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    },
  },
})
