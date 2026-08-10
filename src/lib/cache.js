// A tiny in-memory TTL cache, so re-visiting a format doesn't re-fetch it.
//
// Clicking through the six format buttons costs 21 requests each time (1 ladder
// + 20 player searches). Ladder standings don't change minute to minute, so
// repeating that on every click is pure waste — and impolite to a free public
// API we don't own.
//
// Deliberately in-memory only: a page reload starts fresh, which keeps the data
// honest and avoids persisting anything to disk.

export const DEFAULT_TTL_MS = 5 * 60 * 1000

export function createCache({ ttl = DEFAULT_TTL_MS } = {}) {
  // key -> { expires, promise }
  const entries = new Map()

  return {
    /**
     * Return the cached promise for `key`, or run `factory()` and cache it.
     *
     * Caches the *promise*, not the resolved value, so two components asking
     * for the same thing at the same time share one request instead of racing.
     *
     * NOTE: do not pass a component's AbortSignal into `factory`. The promise is
     * shared, so one component unmounting would cancel everyone else's copy.
     * Callers should let the request finish and simply ignore the result if
     * they've moved on — which also means the work still warms the cache.
     */
    get(key, factory) {
      const hit = entries.get(key)
      if (hit && hit.expires > Date.now()) return hit.promise

      const promise = factory()
      entries.set(key, { expires: Date.now() + ttl, promise })

      // Never cache a failure: a network blip shouldn't poison this key for the
      // next five minutes.
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key)
      })

      return promise
    },

    clear() {
      entries.clear()
    },

    get size() {
      return entries.size
    },
  }
}
