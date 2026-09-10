import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'list' : [['list']],
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /performance\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The budgets in `performance.spec.ts` are wall-clock measurements of the app, and a
      // wall clock shared with four other browsers measures the machine instead: the same
      // graph draws in 600ms or 1100ms depending on what else Playwright happens to be
      // running. So it runs alone, after everything else has finished with the CPU.
      name: 'performance',
      testMatch: /performance\.spec\.ts/,
      dependencies: ['chromium'],
      workers: 1,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Tests run against a production build: dev-only overlays would sit on top of the UI.
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
