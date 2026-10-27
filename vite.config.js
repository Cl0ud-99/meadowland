import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, open: false },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1600 },
})
