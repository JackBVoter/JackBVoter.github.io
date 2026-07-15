import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'

// After a build, copy dist/index.html -> dist/404.html.
// GitHub Pages has no server, so it returns 404.html for any path it can't find
// as a file. Serving a copy of the SPA there lets client-side (declarative)
// React Router handle deep links and page refreshes on routes like /about.
function spaFallback404() {
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // User site (jackbvoter.github.io) is served from the root path.
  base: '/',
  plugins: [react(), spaFallback404()],
})
