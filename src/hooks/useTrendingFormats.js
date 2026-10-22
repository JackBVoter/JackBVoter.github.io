import { useEffect, useState } from 'react'

import { fetchRecentReplays } from '../api/showdown.js'
import { SUPPORTED_FORMATS } from '../data/formats.js'
import { createCache } from '../lib/cache.js'
import { mapWithConcurrency } from '../lib/pool.js'
import { rankTrendingFormats, sampleWindowMinutes } from '../lib/trending.js'
import { getLadder } from './useLadder.js'

// Pages of the site-wide feed to sample. Each is 51 replays and, at the time of
// writing, covers roughly 4-5 minutes, so four pages is about the last 20 — a
// few hundred battles, enough for the top handful of formats to stand out
// (verified live 2026-10-21). The pages chain through `before=`, so they can't
// run in parallel; four sequential requests is the cost of the whole row.
export const FEED_PAGES = 4

// How many trending buttons to show at most.
export const MAX_TRENDING = 5

// Candidates to check, a few more than we show: some will fail the ladder
// check (unrated formats have no ladder), and those slots should go to the
// next most played rather than be left empty.
const CANDIDATES = MAX_TRENDING + 3

// Trends move slower than ladders need to be fresh, and this costs up to a
// dozen requests, so hold it twice as long as the 5-minute default.
const trendingCache = createCache({ ttl: 10 * 60 * 1000 })

const ALREADY_OFFERED = new Set(SUPPORTED_FORMATS.map((format) => format.id))

// The last result, readable synchronously. The player page's "← back to
// formats" link uses it to decide whether the start page can show a format;
// it can't wait on a promise to render a link.
let latest = null

async function sampleFeed() {
  const all = []
  let before
  for (let page = 0; page < FEED_PAGES; page += 1) {
    const batch = await fetchRecentReplays({ before })
    if (!Array.isArray(batch) || batch.length === 0) break
    all.push(...batch)
    const oldest = batch.at(-1)?.uploadtime
    // No usable cursor means no way to step further back.
    if (!Number.isFinite(oldest) || oldest === before) break
    before = oldest
  }
  return all
}

async function loadTrendingFormats() {
  const replays = await sampleFeed()
  const candidates = rankTrendingFormats(replays, {
    exclude: ALREADY_OFFERED,
    limit: CANDIDATES,
  })

  // Showing a button is a promise that clicking it shows a ladder. A wrong or
  // unrated formatid returns 200 with an empty toplist, so prove each one.
  const checks = await mapWithConcurrency(
    candidates,
    async (candidate) => (await getLadder(candidate.id)).length > 0,
    { concurrency: 4 },
  )
  const formats = candidates
    .filter((_, index) => checks[index]?.ok && checks[index].value)
    .slice(0, MAX_TRENDING)
    .map((format) => ({ ...format, teamPreview: true, trending: true }))

  latest = { formats, windowMinutes: sampleWindowMinutes(replays) }
  return latest
}

/**
 * Formats outside the fixed list that are being played a lot right now.
 *
 * @returns {{ formats: Array<{id, label, count}>, windowMinutes: number,
 *   loading: boolean, error: Error|null }}
 */
export function useTrendingFormats() {
  // Start from the last result so returning to the start page doesn't flash an
  // empty row — and, more importantly, so a ?format= naming a trending format
  // resolves on the first render instead of briefly falling back.
  const [state, setState] = useState(() => ({
    formats: latest?.formats ?? [],
    windowMinutes: latest?.windowMinutes ?? 0,
    loading: !latest,
    error: null,
  }))

  useEffect(() => {
    // Per-run flag, not a latch: StrictMode runs this effect, its cleanup, and
    // the effect again on mount, and the second run must still deliver.
    let active = true
    trendingCache
      .get('trending', loadTrendingFormats)
      .then((result) => {
        if (active) setState({ ...result, loading: false, error: null })
      })
      .catch((error) => {
        if (active) setState({ formats: [], windowMinutes: 0, loading: false, error })
      })
    return () => {
      active = false
    }
  }, [])

  return state
}

/** Whether the last trending result includes `formatId`. Synchronous. */
export function isTrendingFormat(formatId) {
  return Boolean(latest?.formats.some((format) => format.id === formatId))
}
