import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

const chrome = { ...devices['Desktop Chrome'] }

/**
 * Four projects, because three kinds of spec want three different things.
 *
 * `app` is the suite. `performance` is the same browser measuring wall-clock budgets, which
 * a wall clock shared with nine other workers cannot do — the same graph draws in 600ms or
 * 1100ms depending on what else is running — so it runs alone, after `app` has let go of the
 * CPU. `screenshots` and `logo` write files into the repository and are not tests at all;
 * they have their own scripts and are never part of a run that only means to check something.
 *
 * The split is by project rather than by `--grep`, because a grep does not reach a project
 * another project depends on: `--grep-invert screenshots` would have quietly stopped
 * excluding anything the moment `performance` gained its dependency.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'list' : [['list']],
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'app',
      testIgnore: /(performance|screenshots|logo-assets)\.spec\.ts/,
      use: chrome,
    },
    {
      name: 'performance',
      testMatch: /performance\.spec\.ts/,
      dependencies: ['app'],
      workers: 1,
      fullyParallel: false,
      use: chrome,
    },
    { name: 'screenshots', testMatch: /screenshots\.spec\.ts/, use: chrome },
    { name: 'logo', testMatch: /logo-assets\.spec\.ts/, use: chrome },
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
