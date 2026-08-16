// Tests for the ladder Replays column's request scheduler.
//
// This exists because of a real bug: stop() was a one-way latch, and React's
// StrictMode mounts effects twice in development (mount, clean up, mount again).
// The single cleanup permanently stopped the only loader the first format would
// ever have, so the column was blank on load and only populated once you
// switched format and got a fresh loader. Reading the code did not catch it.
//
// No React and no network — the page fetcher is injected. Run:
//   node scripts/check-count-loader.mjs

import { COUNT_CONCURRENCY, createCountLoader } from '../src/hooks/useReplayCounts.js'

let failures = 0

function check(name, condition, detail = '') {
  const status = condition ? 'PASS ' : 'FAIL '
  if (!condition) failures += 1
  console.log(`${status} ${name}${detail ? `  — ${detail}` : ''}`)
}

/** A fetcher that records calls and resolves when told to. */
function fakePages() {
  const calls = []
  const pending = new Map()
  return {
    calls,
    fetch(userId) {
      calls.push(userId)
      return new Promise((resolve, reject) => pending.set(userId, { resolve, reject }))
    },
    settle(userId, value) {
      pending.get(userId).resolve(value)
      pending.delete(userId)
    },
    fail(userId) {
      pending.get(userId).reject(new Error('nope'))
      pending.delete(userId)
    },
    get inFlight() {
      return pending.size
    },
  }
}

// Let queued .then/.finally callbacks run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// --- 1. The StrictMode double-mount ----------------------------------------
{
  const pages = fakePages()
  const results = new Map()
  const loader = createCountLoader('gen9ou', (k, v) => results.set(k, v), pages.fetch)

  // Exactly what React does in development: mount, clean up, mount again.
  loader.start()
  loader.stop()
  loader.start()

  loader.request('alice')
  await flush()

  check(
    'a row still fetches after StrictMode mount/cleanup/mount',
    pages.calls.includes('alice'),
    `calls: [${pages.calls.join(', ')}]`,
  )

  pages.settle('alice', { replays: [{ id: 'gen9ou-1' }, { id: 'gen9ou-2' }], complete: true })
  await flush()
  const value = results.get('gen9ou|alice')
  check(
    'the count reaches the component',
    value?.count === 2 && value?.exact === true,
    JSON.stringify(value),
  )
}

// --- 2. Requests made while stopped are not lost ---------------------------
{
  const pages = fakePages()
  const loader = createCountLoader('gen9ou', () => {}, pages.fetch)

  loader.stop()
  loader.request('bob') // a row can intersect before the effect re-arms
  await flush()
  check('a stopped loader issues nothing', pages.calls.length === 0)

  loader.start()
  await flush()
  check(
    'start() drains what queued up while stopped',
    pages.calls.includes('bob'),
    `calls: [${pages.calls.join(', ')}]`,
  )
}

// --- 3. A stopped loader stops reporting -----------------------------------
{
  const pages = fakePages()
  const results = new Map()
  const loader = createCountLoader('gen9ou', (k, v) => results.set(k, v), pages.fetch)

  loader.start()
  loader.request('carol')
  await flush()
  results.clear() // drop the {loading:true} we already saw

  loader.stop() // e.g. the user switched format
  pages.settle('carol', { replays: [], complete: true })
  await flush()
  check("a stopped loader doesn't write into the new format's state", results.size === 0)
}

// --- 4. The concurrency cap holds ------------------------------------------
{
  const pages = fakePages()
  const loader = createCountLoader('gen9ou', () => {}, pages.fetch)
  loader.start()

  for (let i = 0; i < 20; i += 1) loader.request(`p${i}`)
  await flush()
  check(
    `never more than ${COUNT_CONCURRENCY} requests in flight`,
    pages.inFlight === COUNT_CONCURRENCY,
    `in flight: ${pages.inFlight}`,
  )

  pages.settle('p0', { replays: [], complete: true })
  await flush()
  check(
    'a finished request lets the next one start',
    pages.calls.length === COUNT_CONCURRENCY + 1,
    `calls: ${pages.calls.length}`,
  )
}

// --- 5. Rows still on screen jump the queue -------------------------------
{
  const pages = fakePages()
  const loader = createCountLoader('gen9ou', () => {}, pages.fetch)
  loader.start()

  // Fill the pipe, then queue a backlog, then scroll it all off screen.
  for (let i = 0; i < COUNT_CONCURRENCY; i += 1) loader.request(`busy${i}`)
  for (let i = 0; i < 5; i += 1) loader.request(`gone${i}`)
  for (let i = 0; i < 5; i += 1) loader.release(`gone${i}`)
  // The row the reader actually stopped at, queued last of all.
  loader.request('wanted')
  await flush()

  pages.settle('busy0', { replays: [], complete: true })
  await flush()
  check(
    'the visible row is served before the backlog scrolled past',
    pages.calls.includes('wanted'),
    `after the slot freed, calls were: [${pages.calls.join(', ')}]`,
  )
}

// --- 6. Result shapes ------------------------------------------------------
{
  const pages = fakePages()
  const results = new Map()
  const loader = createCountLoader('gen9ou', (k, v) => results.set(k, v), pages.fetch)
  loader.start()

  loader.request('full')
  await flush()
  check('a row reports loading first', results.get('gen9ou|full')?.loading === true)

  // A full page: the count is a floor, and the column must render "51+".
  pages.settle('full', { replays: new Array(51).fill({ id: 'gen9ou-1' }), complete: false })
  await flush()
  const floor = results.get('gen9ou|full')
  check(
    'a full page reports a floor, not a total',
    floor?.count === 51 && floor?.exact === false,
    JSON.stringify(floor),
  )

  loader.request('broken')
  await flush()
  pages.fail('broken')
  await flush()
  check(
    'a failed listing marks only that row',
    results.get('gen9ou|broken')?.failed === true,
    JSON.stringify(results.get('gen9ou|broken')),
  )
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
