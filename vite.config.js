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
  build: {
    // Keep the type icons out of the JS bundle.
    //
    // They are ~1 kB each, so Vite's default 4 kB threshold base64-inlines them
    // — all eighteen, into the main chunk, costing ~14 kB gzip on every page
    // load including the start page, which never shows a type. As separate
    // files the browser fetches only the handful of types a player actually
    // used, and caches them across visits.
    //
    // A function rather than `assetsInlineLimit: 0` so that genuinely tiny
    // future assets can still be inlined.
    assetsInlineLimit: (filePath) => !/IC_XY\.png$/.test(filePath),
  },
})
