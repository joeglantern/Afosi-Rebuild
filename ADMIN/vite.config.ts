import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Shared with the public site: the blog editor's preview renders
      // Markdown with the same module (src/markdown.js) and styles it with
      // the same stylesheet (public/blog-prose.css) as the live post page.
      '@site': path.resolve(__dirname, '../src'),
      '@site-public': path.resolve(__dirname, '../public'),
    },
  },
  server: {
    port: 3000,
    // Let the dev server read those two shared files from outside ADMIN/.
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        path.resolve(__dirname, '../src/markdown.js'),
        path.resolve(__dirname, '../public/blog-prose.css'),
      ],
    },
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
