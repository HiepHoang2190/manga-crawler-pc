// e2e/playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Electron tests must run serially
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never' }]],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.js',
    },
  ],
});
