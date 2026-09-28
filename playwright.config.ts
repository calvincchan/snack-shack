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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: LOCAL_API_URL,
      VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    },
  },
})
