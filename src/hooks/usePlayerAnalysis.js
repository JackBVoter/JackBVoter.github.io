import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchAllReplayMeta,
  fetchReplay,
  fetchUser,
  formatIdFromReplayId,
  isRegistered,
  toUserId,
} from '../api/showdown.js'
import { failureCount, mapWithConcurrency, successes } from '../lib/pool.js'
import { parseReplay } from '../lib/parseReplay.js'
import { aggregate } from '../lib/aggregate.js'
import { createCache } from '../lib/cache.js'

// A finished replay never changes, so this can be cached generously. It mainly
// pays off when the user raises "how many games?" — the replays already fetched
// are reused and only the new ones hit the network.
const replayCache = createCache({ ttl: 30 * 60 * 1000 })

// The replay *listing* is cheap — 51 per page, so covering the largest offered
// game count takes at most 4 requests. We always fetch the full listing up to
// this cap so the UI can tell the user how many replays actually exist, then
// download only as many battle logs as they asked for. Downloading logs is the
// expensive part (one request each).
export const MAX_REPLAY_LIMIT = 200
const metaCache = createCache()

// Analysing a player is potentially hundreds of requests, so cap how many
// replays we pull by default and let the user opt into a deeper scan.
export const DEFAULT_REPLAY_LIMIT = 50
export const CONCURRENCY = 6

const IDLE = { phase: 'idle', done: 0, total: 0 }

/**
 * Which formats this player has public replays in, most-played first.
 * Derived from the listing, so it costs nothing extra and lets the page offer
 * only formats that actually have data behind them.
 */
function countFormats(meta) {
  const counts = new Map()
  for (const entry of meta) {
    const id = formatIdFromReplayId(entry.id)
    const row = counts.get(id) ?? { formatId: id, label: entry.format || id, count: 0 }
    row.count += 1
    counts.set(id, row)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

/**
 * Fetch and analyse every available replay for a Showdown username.
 *
 * Returns the analysis plus a `progress` object so the page can show what is
 * happening during what may be a minute of network traffic.
 */
export function usePlayerAnalysis(
  username,
  { limit = DEFAULT_REPLAY_LIMIT, format = null } = {},
) {
  const [progress, setProgress] = useState(IDLE)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  // Lets an in-flight analysis be cancelled when the user searches for someone
  // else (or navigates away) instead of racing the new one.
  const abortRef = useRef(null)

  const run = useCallback(async () => {
    const userId = toUserId(username)
    if (!userId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setData(null)
    setError(null)
    setProgress({ phase: 'searching', done: 0, total: 0 })

    try {
      // Profile is a nice-to-have; a failure here must not sink the analysis,
      // and fetchUser already returns null instead of throwing. Showdown hands
      // back a placeholder body for names that don't exist, so keep it only if
      // it's a real registered account.
      const profilePromise = fetchUser(userId, { signal }).then((p) =>
        isRegistered(p) ? p : null,
      )

      // The full listing, independent of `limit`, so we know the true number of
      // replays available. Cached per user: changing the game count must not
      // re-walk the pages. No signal — the promise is shared (see cache.js).
      const allMeta = await metaCache.get(`meta:${userId}`, () =>
        fetchAllReplayMeta(userId, { limit: MAX_REPLAY_LIMIT }),
      )

      if (signal.aborted) return

      // Always derived from the *unfiltered* listing, so the page can offer a
      // format filter covering everything this player has played.
      const formatCounts = countFormats(allMeta)

      // Fetch the chosen format's own listing rather than filtering the
      // unfiltered one. Filtering client-side would divide MAX_REPLAY_LIMIT
      // across every format the player has ever touched, so a scoped view could
      // never reach the full sample — a player with 200 replays spread over ten
      // formats would top out at ~20 per format no matter what was selected.
      //
      // Statistics from other formats must never leak in: a top VGC 2026
      // Reg M-B player may have zero replays in that format, and the honest
      // answer there is "nothing to show".
      const scoped = format
        ? await metaCache.get(`meta:${userId}:${format}`, () =>
            fetchAllReplayMeta(userId, { limit: MAX_REPLAY_LIMIT, format }),
          )
        : allMeta

      if (signal.aborted) return

      const available = scoped.length
      // Never claim to analyse more than exists.
      const meta = scoped.slice(0, Math.min(limit, available))

      if (meta.length === 0) {
        setProgress({ phase: 'done', done: 0, total: 0 })
        setData({
          userId,
          displayName: username,
          profile: await profilePromise,
          battles: [],
          stats: aggregate([]),
          format,
          formatCounts,
          totalAvailable: allMeta.length,
          // The unfiltered listing stops at MAX_REPLAY_LIMIT, so when it comes
          // back full the per-format counts are a floor, not a total.
          totalCapped: allMeta.length >= MAX_REPLAY_LIMIT,
          available,
          analysed: 0,
          skipped: 0,
          failed: 0,
        })
        return
      }

      setProgress({ phase: 'fetching', done: 0, total: meta.length })

      const results = await mapWithConcurrency(
        meta,
        // No signal on the cached call: the promise is shared, so aborting it
        // would cancel it for every other caller. mapWithConcurrency still
        // stops handing out new work when `signal` fires.
        (entry) => replayCache.get(entry.id, () => fetchReplay(entry.id)),
        {
          concurrency: CONCURRENCY,
          signal,
          onProgress: ({ done, total }) =>
            setProgress({ phase: 'fetching', done, total }),
        },
      )

      if (signal.aborted) return

      setProgress({ phase: 'analysing', done: meta.length, total: meta.length })

      const replays = successes(results)
      const battles = replays
        .map((replay) => parseReplay(replay, userId))
        .filter(Boolean)

      // Newest first, matching the order Showdown lists replays in.
      battles.sort((a, b) => (b.uploadTime ?? 0) - (a.uploadTime ?? 0))

      setData({
        userId,
        displayName: battles[0]?.me.name || username,
        profile: await profilePromise,
        battles,
        stats: aggregate(battles),
        format,
        formatCounts,
        totalAvailable: allMeta.length,
        totalCapped: allMeta.length >= MAX_REPLAY_LIMIT,
        // How many public replays exist in the current scope (capped at
        // MAX_REPLAY_LIMIT) versus how many we downloaded for this analysis.
        available,
        analysed: meta.length,
        // Replays that downloaded but had no usable log for this user.
        skipped: replays.length - battles.length,
        failed: failureCount(results),
      })
      setProgress({ phase: 'done', done: meta.length, total: meta.length })
    } catch (err) {
      if (signal.aborted || err?.name === 'AbortError') return
      setError(err)
      setProgress({ phase: 'error', done: 0, total: 0 })
    }
  }, [username, limit, format])

  useEffect(() => {
    if (!toUserId(username)) {
      setData(null)
      setError(null)
      setProgress(IDLE)
      return undefined
    }
    run()
    return () => abortRef.current?.abort()
  }, [run, username])

  return { progress, data, error, reload: run }
}
