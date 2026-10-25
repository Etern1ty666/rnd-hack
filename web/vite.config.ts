import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // GitHub Pages serves the site from /rnd-hack/
  base: command === 'build' || isPreview ? '/rnd-hack/' : '/',
  // вторая страница — варианты робота Vi: /rnd-hack/robots.html
  build: { rollupOptions: { input: ['index.html', 'robots.html'] } },
}))
