/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Built into ../ui (embedded into the exe, served by OverlayForm at https://app.petoverlay/). Flat output: the
// csproj embeds ui\* without subfolders.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  base: './',
  build: { outDir: '../ui', emptyOutDir: true, assetsDir: '', chunkSizeWarningLimit: 2000 },
  // Unit tests for pure logic (npm test); the e2e tests in e2e/ run with Playwright (npm run test:e2e).
  test: { include: ['src/**/*.test.ts'], setupFiles: ['src/test-setup.ts'] },
})
