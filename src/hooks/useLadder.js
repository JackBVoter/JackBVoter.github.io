import { useEffect, useState } from 'react'

import { fetchLadder } from '../api/showdown.js'
import { createCache } from '../lib/cache.js'

// The design calls for a top 100; the API hands back 500.
export const TOP_N = 100

// Shared across the app: revisiting a format within the TTL costs nothing.
const ladderCache = createCache()

/**
 * Load a format's ladder. Pass null to clear.
 *
 * One request covers the whole dashboard — the response already carries
 * username, W/L, GXE and Elo — so nothing else needs fetching, and clicking
 * through to a player costs no extra call because we already hold their userid.
 */
export function useLadder(formatId, { top = TOP_N } = {}) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!formatId) {
      setPlayers([])
      setError(null)
      setLoading(false)
      return undefined
    }

    // Not passed to the request itself — the request is shared via the cache.
    // This only decides whether *this* component still cares about the answer.
    let active = true
    setLoading(true)
    setError(null)

    ladderCache
      .get(formatId, () => fetchLadder(formatId))
      .then((toplist) => {
        if (!active) return
        setPlayers(toplist.slice(0, top))
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err)
        setLoading(false)
      })

    // Switching formats quickly must not let a slow earlier response overwrite
    // the newer one. The request itself still completes and warms the cache.
    return () => {
      active = false
    }
  }, [formatId, top])

  return { players, loading, error }
}
