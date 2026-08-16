// One shared, cached "page 1 of this player's replays in this format".
//
// Two features on the start page need exactly the same request:
//   - Recent Replays, which wants the newest few replays per ranked player.
//   - the ladder's Replays column, which wants how many that player has.
//
// Before this existed the first one made that request and threw the count away.
// Keyed per player rather than per feature, so the ladder's count for anyone in
// the top 20 is already downloaded by the time you look at it, and scrolling
// those rows costs nothing.
//
// This is also the only lever we have on politeness. A count is one request per
// player and there is no bulk endpoint, so the app fetches counts for rows the
// reader actually scrolls to (see useReplayCounts) and every one of them lands
// here — a row that leaves and re-enters the viewport, or a format revisited
// within the TTL, never asks Showdown twice.

import { fetchReplayPageInFormat } from '../api/showdown.js'
import { createCache } from './cache.js'

// Same 5 minutes as ladders and replay listings elsewhere: standings and upload
// counts don't move minute to minute.
const pageCache = createCache()

/**
 * @returns {Promise<{replays: object[], complete: boolean}>} `complete` means
 *   the page was short, so `replays.length` is an exact count rather than a floor.
 */
export function getReplayPage(userId, formatId) {
  // No AbortSignal, deliberately — the promise is shared between callers, so one
  // component walking away must not cancel it for the others. See cache.js.
  return pageCache.get(`${formatId}|${userId}`, () =>
    fetchReplayPageInFormat(userId, formatId),
  )
}
