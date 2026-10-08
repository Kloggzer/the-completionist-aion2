// E2E tests against the built UI (vite preview of ../ui) with a mocked C# host (see e2e/host.ts).
// Uses the installed Microsoft Edge (channel msedge): no browser download needed.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.out',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/', channel: 'msedge', viewport: { width: 640, height: 800 }, locale: 'de-DE' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: true },
})
