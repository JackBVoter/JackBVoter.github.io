# Pokémon Web Project

## What this is
A web development class project. The class **encourages AI use** — the professor
said hand-written code isn't required; the goal is learning to build software by
working with an AI. This is a **multi-week** project (started 2026-07-12).

## Access boundary (IMPORTANT — this is a work machine)
- Work **only inside this project folder** (`C:\Users\jbyers\pokemonwebproject`).
- **Never** read, open, or pull in files from elsewhere on the machine. No work
  content, credentials, or personal files should ever enter context — they must
  not end up sent to the AI service.
- Do not use Epic MCP tools (codesearch, quasar, epic-knowledge) for this project
  unless explicitly asked — this is a personal class project, not work.
- The only exception is Claude Code's own config/memory under `.claude` and
  `~/.claude`, which is needed to remember the project across sessions.

## What we're building
A website that builds **player statistics dashboards** from **Pokémon Showdown**
public APIs. Flow: user searches a Showdown username → site fetches & analyzes all
of that player's replays → derives statistics → renders dashboards.

Key APIs (all CORS-open with `Access-Control-Allow-Origin: *`, verified 2026-07-12,
so browser-side fetch works — no server required):
- Replay list: `https://replay.pokemonshowdown.com/search.json?user=USERNAME` (paginated)
- Replay data: `https://replay.pokemonshowdown.com/<id>.json`
- User ratings: `https://pokemonshowdown.com/users/USERNAME.json`

**Tech stack: React 19 + Vite 8**, with React-Bootstrap (+ Bootstrap 5.3) for UI
and React Router 7 for routing.

### HARD CONSTRAINT — client-side only (never break this)
This app MUST stay a **purely client-side, static React + JavaScript** app so it
runs on GitHub Pages. **Never** introduce: Next.js, server-side rendering (SSR),
React Server Components, React Router "framework mode", API routes, or any Node
backend/serverless function. All data comes from the browser via `fetch` to the
public Showdown APIs. Router stays in declarative mode (`<BrowserRouter>`). JS
only — no TypeScript unless explicitly requested. Vite is used only as a static
build tool (outputs `dist/` static assets). **Hosting: GitHub Pages is sufficient** (static,
public APIs, CORS-open). Vercel/Netlify only if we later want a serverless proxy
for caching / rate-limit avoidance. Biggest challenge is request volume — "all
replays" can mean hundreds of fetches (needs concurrency limits + progress UI +
rate-limit care).

### Dev commands
- `npm run dev` — start the local dev server (Vite, hot reload)
- `npm run build` — production build into `dist/`
- `npm run preview` — serve the built `dist/` locally

### Known deploy note (for later)
Routing uses `BrowserRouter`. On GitHub Pages project sites, deep links / refresh
on a sub-route 404 unless we add a `404.html` SPA fallback or switch to
`HashRouter`. Also set Vite `base` to `/<repo-name>/` at deploy time. Not an issue
during local dev.

## Requirements / logistics
_TBD — need professor's requirements, due date, and how it gets submitted/demoed._

## Status log
- 2026-07-12: Project set up. Access boundary + memory configured. Empty folder,
  no code yet. Next: decide app idea + tech stack.
- 2026-07-14: Scaffolded React 19 + Vite 8 app (authored files manually to avoid
  create-vite wiping .claude/CLAUDE.md). Installed react-bootstrap + bootstrap and
  react-router-dom. Basic app: dark Navbar + Home/About routes proving all three
  libs work. `npm run build` passes. Next: build the username search + replay fetch.
