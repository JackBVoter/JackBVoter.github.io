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

// Analyzing a player is potentially hundreds of requests, so cap how many
// replays we pull by default and let the user opt into a deeper scan.
export const DEFAULT_REPLAY_LIMIT = 50
export const CONCURRENCY = 6

const IDLE = { phase: 'idle', done: 0, total: 0 }

/**
 * Which formats this player has public replays in, most-played first.
 * Derived from the listing, so it costs nothing extra and lets the page offer
 * only formats that actually have data behind them.
 *
 * The listing stops at MAX_REPLAY_LIMIT, so this ranks formats by their share
 * of the player's most recent replays, not their whole career.
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
 * Fetch and analyze every available replay for a Showdown username.
 *
 * Returns the analysis plus a `progress` object so the page can show what is
 * happening during what may be a minute of network traffic.
 *
 * `includeUnrated: false` drops direct challenges and keeps only ladder games.
 * Note this necessarily happens AFTER downloading: whether a battle was rated
 * comes from the `|rated|` line in the log, and the listing's `rating` field
 * can't stand in for it (measured 2026-08-11: two of forty replays had a null
 * listing rating on games the log confirmed rated). So the filter shrinks the
 * sample rather than reaching deeper for replacements — `unratedExcluded` says
 * by how much, and the caller is expected to show it.
 */
export function usePlayerAnalysis(
  username,
  { limit = DEFAULT_REPLAY_LIMIT, format = null, includeUnrated = true } = {},
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

      // Every dashboard is scoped to exactly one format — there is no
      // "all formats" view. Mixing them produces numbers that describe no real
      // game: a win rate averaged over OU and Random Battle, a "most used team"
      // assembled from formats with different legal Pokémon. When the caller
      // hasn't chosen, start from the format this player plays most so the page
      // opens on their main rather than on an arbitrary default they may never
      // have touched.
      const activeFormat = format ?? formatCounts[0]?.formatId ?? null

      // Fetch the chosen format's own listing rather than filtering the
      // unfiltered one. Filtering client-side would divide MAX_REPLAY_LIMIT
      // across every format the player has ever touched, so a scoped view could
      // never reach the full sample — a player with 200 replays spread over ten
      // formats would top out at ~20 per format no matter what was selected.
      // Going back to the API means `limit` really does buy `limit` games of
      // the selected format.
      //
      // Statistics from other formats must never leak in: a top VGC 2026
      // Reg M-B player may have zero replays in that format, and the honest
      // answer there is "nothing to show". A null activeFormat means the player
      // has no public replays at all, so there is nothing to scope to.
      const scoped = activeFormat
        ? await metaCache.get(`meta:${userId}:${activeFormat}`, () =>
            fetchAllReplayMeta(userId, {
              limit: MAX_REPLAY_LIMIT,
              format: activeFormat,
            }),
          )
        : []

      if (signal.aborted) return

      const available = scoped.length
      // Never claim to analyze more than exists.
      const meta = scoped.slice(0, Math.min(limit, available))

      if (meta.length === 0) {
        setProgress({ phase: 'done', done: 0, total: 0 })
        setData({
          userId,
          displayName: username,
          profile: await profilePromise,
          battles: [],
          stats: aggregate([]),
          // The format actually used, which may be one we picked rather than
          // one the caller asked for — the page reads this back to show the
          // scope and to put it in the URL.
          format: activeFormat,
          formatCounts,
          totalAvailable: allMeta.length,
          // The unfiltered listing stops at MAX_REPLAY_LIMIT, so when it comes
          // back full the per-format counts are a floor, not a total.
          totalCapped: allMeta.length >= MAX_REPLAY_LIMIT,
          available,
          analyzed: 0,
          unratedExcluded: 0,
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

      setProgress({ phase: 'analyzing', done: meta.length, total: meta.length })

      const replays = successes(results)
      const battles = replays
        .map((replay) => parseReplay(replay, userId))
        .filter(Boolean)

      // Newest first, matching the order Showdown lists replays in.
      battles.sort((a, b) => (b.uploadTime ?? 0) - (a.uploadTime ?? 0))

      // Ladder games only, when asked. Everything downstream — stats, the
      // showcase, the chart — runs on `kept`, so the toggle is honoured
      // everywhere rather than in one widget.
      const kept = includeUnrated ? battles : battles.filter((b) => b.rated)

      setData({
        userId,
        // Read the display name off the unfiltered list: excluding unrated
        // games must not be able to leave us without a name to show.
        displayName: battles[0]?.me.name || username,
        profile: await profilePromise,
        battles: kept,
        stats: aggregate(kept),
        format: activeFormat,
        formatCounts,
        totalAvailable: allMeta.length,
        totalCapped: allMeta.length >= MAX_REPLAY_LIMIT,
        // How many public replays exist in the current scope (capped at
        // MAX_REPLAY_LIMIT) versus how many we downloaded for this analysis.
        available,
        analyzed: meta.length,
        // Replays that downloaded but had no usable log for this user.
        skipped: replays.length - battles.length,
        failed: failureCount(results),
        // Parsed fine but dropped for being unrated. Zero when the toggle is
        // on. Distinguishes "no games here" from "no *ladder* games here".
        unratedExcluded: battles.length - kept.length,
      })
      setProgress({ phase: 'done', done: meta.length, total: meta.length })
    } catch (err) {
      if (signal.aborted || err?.name === 'AbortError') return
      setError(err)
      setProgress({ phase: 'error', done: 0, total: 0 })
    }
  }, [username, limit, format, includeUnrated])

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
