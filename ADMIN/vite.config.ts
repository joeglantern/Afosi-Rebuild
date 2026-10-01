import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // Local development: send /api to a locally running cms-server, so the
    // session cookie is same-origin exactly as it is behind nginx in
    // production. Has no effect on the production build.
    proxy: {
      '/api': {
        target: process.env.CMS_DEV_URL || 'http://127.0.0.1:8792',
        changeOrigin: false,
      },
    },
  },
})
