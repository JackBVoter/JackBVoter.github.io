// Work out which formats people are playing right now, from a sample of the
// site-wide replay feed.
//
// Pure — no fetching — so scripts/check-trending.mjs can run the exact same
// ranking against live data without React.
//
// There is no "popular formats" endpoint. The feed of recent public replays is
// the only popularity signal the public API offers: a short window of it is a
// snapshot of what is being played this half hour, which also means it swings
// with the time of day. That's acceptable for a "Trending now" row — the fixed
// list in src/data/formats.js stays the always-there default.

import { formatIdFromReplayId } from '../api/showdown.js'

// Main-server formatids all start with the generation ("gen9ou",
// "gen9championsvgc2026regmc"). Replays from other servers keep a prefix
// ("smogtours-gen9ou", "rom-gen9randombattle") — those are tournament or
// side-server games with no ladder of their own on the main site.
const MAIN_SERVER_FORMAT = /^gen\d+[a-z0-9]+$/

/**
 * "[Gen 9 Champions] VGC 2026 Reg M-C" -> "Gen 9 Champions VGC 2026 Reg M-C".
 *
 * The feed's `format` is Showdown's own display name, so new formats arrive
 * already labelled — unlike the ladder, which echoes some ids straight back.
 */
export function labelFromFormatName(name) {
  return String(name ?? '')
    .replace(/^\[([^\]]+)\]\s*/, '$1 ')
    .trim()
}

/**
 * Rank formats by how many replays of each appear in `replays`.
 *
 * @param {object[]} replays - entries from the site-wide feed, any order
 * @param {object} options
 * @param {Set<string>} options.exclude - formatids not to suggest (already offered)
 * @param {number} options.minCount - fewer replays than this is noise, not a trend
 * @param {number} options.limit - how many candidates to return
 * @returns {Array<{id, label, count, rated}>} most played first
 */
export function rankTrendingFormats(
  replays,
  { exclude = new Set(), minCount = 3, limit = 8 } = {},
) {
  const seen = new Set()
  const byFormat = new Map()

  for (const replay of replays) {
    // Feed pages overlap at the `before=` seam, the same way user listings do.
    if (!replay?.id || seen.has(replay.id)) continue
    seen.add(replay.id)

    // Four-player Free-For-All and Multi battles: the parser skips them (they
    // aren't 1v1), so a player page in that format would have nothing to show.
    if (!Array.isArray(replay.players) || replay.players.length !== 2) continue

    const id = formatIdFromReplayId(replay.id)
    if (!MAIN_SERVER_FORMAT.test(id) || exclude.has(id)) continue

    let entry = byFormat.get(id)
    if (!entry) {
      entry = { id, label: labelFromFormatName(replay.format) || id, count: 0, rated: 0 }
      byFormat.set(id, entry)
    }
    entry.count += 1
    if (replay.rating > 0) entry.rated += 1
  }

  return [...byFormat.values()]
    // Unrated formats are out: "Unrated Random Battle" still has a "ladder"
    // (43 stale entries, top player 2-0, seen live 2026-10-21), so the ladder
    // check alone lets it through. Every real ladder format in the sample had
    // rated games — even Bo3, where only some games carry a rating — and that
    // one had none.
    .filter((entry) => entry.count >= minCount && entry.rated > 0)
    // Ties broken by id so the row doesn't reshuffle between identical samples.
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, limit)
}

/** Minutes between the newest and oldest replay in the sample. */
export function sampleWindowMinutes(replays) {
  const times = replays.map((replay) => replay?.uploadtime).filter(Number.isFinite)
  if (times.length < 2) return 0
  return Math.round((Math.max(...times) - Math.min(...times)) / 60)
}
