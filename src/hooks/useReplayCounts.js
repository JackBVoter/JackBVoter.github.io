import { useCallback, useEffect, useMemo, useState } from 'react'

import { getReplayPage } from '../lib/replayPageCache.js'

// How many replays a player has in a format, for the ladder's Replays column.
//
// The point of the column is to stop you opening a top-100 player who has three
// public replays, so the number has to be there before you click. The cost of
// that is unavoidable: there is no bulk endpoint, so it is one request per
// player, and the ladder is 100 rows.
//
// So this fetches counts for rows the reader actually scrolls to, not all 100 up
// front. A format view stays at roughly its old cost when you glance at it and
// only pays for the part of the ladder you look at. Concretely: LadderTable
// watches its rows with an IntersectionObserver and calls request()/release() as
// they enter and leave; this schedules the work.

// Deliberately below the 6 used elsewhere. Recent Replays is fetching its own 20
// at concurrency 6 on the same screen at the same time, and this is the less
// urgent of the two — a number that appears a beat later is fine, being
// rate-limited is not.
export const COUNT_CONCURRENCY = 4

// Under this many replays, a dashboard is thin enough that the column should say
// so rather than just state a number. Exported so the table and any future
// caller agree on where "barely worth opening" starts.
export const LOW_REPLAY_COUNT = 6

// Counts are per format — the same player has different numbers in each — and
// the map is keyed accordingly and never cleared, so switching back to a format
// you already scrolled shows its numbers immediately.
function countKey(formatId, userId) {
  return `${formatId}|${userId}`
}

/**
 * The request scheduler, kept as plain JS outside React: a queue with a
 * concurrency cap is state that shouldn't cause renders, and this way the only
 * thing that reaches React is a finished count.
 *
 * Jobs are preferred while their row is still on screen. Scrolling fast queues
 * every row you flew past, and without this the numbers would arrive for rows
 * far behind you while the ones you stopped at sat waiting.
 *
 * Exported, and `fetchPage` injectable, only so scripts/check-count-loader.mjs
 * can exercise the queue without React or a network. The start/stop lifecycle
 * here already shipped one bug that no amount of reading caught.
 */
export function createCountLoader(formatId, onResult, fetchPage = getReplayPage) {
  const asked = new Set()
  const waiting = []
  const onScreen = new Set()
  let inFlight = 0
  let stopped = false

  function pump() {
    while (!stopped && inFlight < COUNT_CONCURRENCY && waiting.length > 0) {
      let index = waiting.findIndex((userId) => onScreen.has(userId))
      // Nothing queued is currently visible — the reader has scrolled past all
      // of it. Still finish the backlog oldest-first; it's already paid for by
      // the time it reaches here, and it warms the cache for the way back up.
      if (index === -1) index = 0
      const [userId] = waiting.splice(index, 1)
      const key = countKey(formatId, userId)

      inFlight += 1
      onResult(key, { loading: true })
      fetchPage(userId, formatId)
        .then(({ replays, complete }) => {
          // `complete` false means page 1 was full, so this is a floor, not a
          // total. The column renders that as "51+".
          if (!stopped) onResult(key, { count: replays.length, exact: complete })
        })
        .catch(() => {
          // One player's listing failing is not worth an error state on the
          // whole ladder — the row just can't say a number.
          if (!stopped) onResult(key, { failed: true })
        })
        .finally(() => {
          inFlight -= 1
          pump()
        })
    }
  }

  return {
    /** This row is on screen: get its count, or move it up the queue. */
    request(userId) {
      onScreen.add(userId)
      if (asked.has(userId)) return
      asked.add(userId)
      waiting.push(userId)
      pump()
    },
    /** Scrolled out of view. Already-queued work stays queued, just deprioritized. */
    release(userId) {
      onScreen.delete(userId)
    },
    /**
     * Arm, or re-arm after a stop(), and drain whatever queued up meanwhile.
     *
     * stop() must NOT be a one-way latch. It was, and StrictMode mounts effects
     * twice in development (mount, clean up, mount again) — so the single
     * cleanup permanently stopped the only loader the first format would ever
     * have, and the column sat blank until you switched format and got a fresh
     * one. Pairing start() with stop() makes the double-mount a no-op.
     */
    start() {
      stopped = false
      // Rows can ask before this runs, so anything already queued has to be
      // picked up here rather than waiting for the next scroll.
      pump()
    },
    /**
     * Stop reporting. In-flight requests are left to finish rather than
     * aborted — they're shared through the cache, and letting them land means a
     * format you flick away from and back to is already loaded.
     */
    stop() {
      stopped = true
    },
  }
}

/**
 * @param {string|null} formatId
 * @returns {{request: (userId: string) => void, release: (userId: string) => void,
 *   countFor: (userId: string) => ({count: number, exact: boolean}|{loading: true}|{failed: true}|null)}}
 *   `countFor` returns null for a row that hasn't been asked about yet.
 */
export function useReplayCounts(formatId) {
  const [counts, setCounts] = useState(() => new Map())

  const setResult = useCallback((key, value) => {
    setCounts((prev) => {
      const next = new Map(prev)
      next.set(key, value)
      return next
    })
  }, [])

  // One loader per format. Recreating it on a format change is what makes the
  // old format's queue stop; its keys stay in `counts` for the trip back.
  const loader = useMemo(
    () => (formatId ? createCountLoader(formatId, setResult) : null),
    [formatId, setResult],
  )

  // Arm on mount, stop on unmount or when the format changes. start() has to be
  // here rather than in createCountLoader: a loader created during render and
  // armed there would be left running by a render React threw away, and — the
  // bug this shape exists to prevent — the cleanup must be survivable, because
  // StrictMode runs it once immediately after mounting.
  useEffect(() => {
    if (!loader) return undefined
    loader.start()
    return () => loader.stop()
  }, [loader])

  // Stable per format, so the observer effect in LadderTable isn't torn down and
  // rebuilt every time a count arrives.
  const request = useCallback((userId) => loader?.request(userId), [loader])
  const release = useCallback((userId) => loader?.release(userId), [loader])

  const countFor = useCallback(
    (userId) => (formatId ? (counts.get(countKey(formatId, userId)) ?? null) : null),
    [counts, formatId],
  )

  return { request, release, countFor }
}
