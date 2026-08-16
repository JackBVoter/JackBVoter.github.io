import { useEffect, useMemo, useState } from 'react'

import { mapWithConcurrency } from '../lib/pool.js'
import { createCache } from '../lib/cache.js'
import { getReplayPage } from '../lib/replayPageCache.js'

// How many ranked players to ask. This cannot be small: of the top 20 Gen 9 OU
// players, only 12 had public replays, and VGC managed just 9. (Filtering the
// format-wide replay feed instead does not work — only 3 of 51 recent OU
// replays involved even a top-500 player.)
export const PLAYERS_TO_QUERY = 20

// Cap per player so one prolific uploader can't fill the whole list.
export const MAX_PER_PLAYER = 3

export const DEFAULT_LIMIT = 20

// Caches the merge and ranking. The requests underneath are cached separately
// and per player (replayPageCache), which is what lets the ladder's Replays
// column reuse them instead of asking Showdown the same thing again.
const replayCache = createCache()

/** Gather, dedupe and rank replays for one format. Cached as a single unit. */
async function gatherReplays(players, formatId, limit) {
  const results = await mapWithConcurrency(
    players,
    (player) => getReplayPage(player.userid, formatId),
    { concurrency: 6 },
  )

  // A player with no public replays yields an empty list, not an error — that
  // is expected and common near the top of the ladder.
  //
  // Walk `results` directly rather than successes(results): that helper drops the
  // failures, which collapses the indices, and the index here IS the player's
  // rank. One failed request and every replay after it in the list would be
  // attributed to the wrong player and labelled with the wrong rank.
  const merged = []
  results.forEach((result, index) => {
    if (!result?.ok) return
    // Exactly-this-format entries only. This used to be the raw page, which let
    // smogtours-gen9ou replays into a list captioned "Gen 9 OU" — Showdown
    // matches the format parameter as a suffix. getReplayPage filters.
    const list = result.value?.replays
    if (!Array.isArray(list)) return
    const player = players[index]
    if (!player) return
    for (const replay of list.slice(0, MAX_PER_PLAYER)) {
      merged.push({
        ...replay,
        rankedUserId: player.userid,
        rankedUsername: player.username,
        rank: index + 1,
      })
    }
  })

  // Two ranked players may have faced each other; keep the higher-ranked one's
  // copy so the attribution is stable.
  const byId = new Map()
  for (const replay of merged) {
    if (!byId.has(replay.id)) byId.set(replay.id, replay)
  }

  return [...byId.values()]
    .sort((a, b) => (b.uploadtime ?? 0) - (a.uploadtime ?? 0))
    .slice(0, limit)
}

/**
 * Recent replays from the top of a format's ladder.
 *
 * Takes the already-loaded ladder rather than re-fetching it, so the cost here
 * is one request per queried player and nothing more.
 *
 * @param {string|null} formatId
 * @param {object[]} players - ladder entries, highest rank first
 */
export function useTopPlayerReplays(formatId, players, { limit = DEFAULT_LIMIT } = {}) {
  const [replays, setReplays] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const queried = useMemo(() => players.slice(0, PLAYERS_TO_QUERY), [players])
  // Stable dependency: the players array gets a new identity on every render,
  // but the set of userids is what actually determines the result.
  const key = useMemo(() => queried.map((p) => p.userid).join(','), [queried])

  useEffect(() => {
    if (!formatId || key === '') {
      setReplays([])
      setError(null)
      setLoading(false)
      return undefined
    }

    let active = true
    setLoading(true)
    setError(null)

    replayCache
      // Keyed on the player set as well as the format: if the ladder shifts,
      // the cached replay list for the old top 20 no longer applies.
      .get(`${formatId}|${key}`, () => gatherReplays(queried, formatId, limit))
      .then((found) => {
        if (!active) return
        setReplays(found)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err)
        setLoading(false)
      })

    return () => {
      active = false
    }
    // `queried` is derived from `key`; depending on it too would re-run the
    // effect on every render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatId, key, limit])

  return { replays, loading, error }
}
