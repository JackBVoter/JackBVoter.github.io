// Thin wrappers around the public Pokémon Showdown APIs.
//
// All three endpoints send `Access-Control-Allow-Origin: *`, so the browser can
// call them directly and we stay a purely client-side app (no backend/proxy).

const REPLAY_BASE = 'https://replay.pokemonshowdown.com'
const USER_BASE = 'https://pokemonshowdown.com'

// Showdown identifies accounts by a "userid": the display name lowercased with
// every non-alphanumeric character stripped. "Blunder Policy" -> "blunderpolicy".
export function toUserId(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

async function getJson(url, { signal } = {}) {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Showdown request failed (${res.status}) for ${url}`)
  }
  return res.json()
}

// search.json returns at most this many replays per page. A short page means we
// have reached the end of the user's public replay history.
export const REPLAYS_PER_PAGE = 51

/**
 * Recover the formatid from a replay id: "gen9ou-2655254787" -> "gen9ou".
 *
 * The replay *listing* has a human-readable `format` ("[Gen 9] OU") but no
 * formatid, and the id's trailing number is the only battle-specific part —
 * everything before it is the format. Ids from other servers keep their prefix
 * ("dragonheaven-gen9blankcanvasmetac-14447"), which is correct: they are a
 * different format from the main-server equivalent.
 */
export function formatIdFromReplayId(id) {
  return String(id ?? '').replace(/-\d+$/, '')
}

/**
 * One page of a user's public replays. Returns an array of metadata objects:
 * { id, format, formatid?, players: [p1, p2], rating, uploadtime, private, password }
 * Note: this listing has no battle log — that requires fetchReplay(id).
 */
export function searchReplayPage(userId, page = 1, opts = {}) {
  const { format, signal } = opts
  const params = new URLSearchParams({ user: userId, page: String(page) })
  // Optional: restrict to one format. The API accepts user and format together.
  if (format) params.set('format', format)
  return getJson(`${REPLAY_BASE}/search.json?${params}`, { signal })
}

/**
 * Walk search.json pages until the user's history runs out or we hit `limit`.
 * onPage({ fetched, page }) fires after each page so the UI can show progress
 * while we are still discovering how much work there is to do.
 */
export async function fetchAllReplayMeta(
  userId,
  { limit = Infinity, format, onPage, signal } = {},
) {
  const all = []
  // Showdown's pagination overlaps at page boundaries — consecutive pages can
  // repeat a replay (observed 2-3 duplicates per 200 for several players). Left
  // in, a duplicated replay is parsed and counted twice, quietly skewing every
  // statistic on the page.
  const seen = new Set()

  for (let page = 1; all.length < limit; page += 1) {
    // Passing `format` filters server-side, so `limit` counts replays *in that
    // format*. Filtering client-side instead would spend the limit on every
    // format the player has ever touched.
    const batch = await searchReplayPage(userId, page, { format, signal })
    if (!Array.isArray(batch) || batch.length === 0) break

    for (const entry of batch) {
      if (!entry?.id || seen.has(entry.id)) continue
      seen.add(entry.id)
      all.push(entry)
    }
    onPage?.({ fetched: all.length, page })

    // A short page is the last page. Checked against the raw batch, not the
    // deduped total, or a page of all-duplicates would look like the end.
    if (batch.length < REPLAYS_PER_PAGE) break
  }

  return all.slice(0, limit === Infinity ? undefined : limit)
}

/**
 * Full replay including the `log` string (the battle protocol we parse).
 */
export function fetchReplay(id, opts = {}) {
  return getJson(`${REPLAY_BASE}/${encodeURIComponent(id)}.json`, opts)
}

/**
 * Account info: registration date and per-format ladder ratings
 * ({ ratings: { gen9ou: { elo, gxe, rpr, w, l }, ... } }).
 *
 * IMPORTANT: a non-null result does NOT mean the account exists. Showdown
 * answers 200 for *any* name, echoing back whatever userid was asked for:
 *   { username: "zzznotreal", userid: "zzznotreal", registertime: 0,
 *     group: 0, ratings: {} }
 * Use isRegistered() or userExists() to decide. Returns null only on a network
 * or parse failure.
 */
export async function fetchUser(userId, opts = {}) {
  try {
    return await getJson(`${USER_BASE}/users/${encodeURIComponent(userId)}.json`, opts)
  } catch {
    return null
  }
}

/** A registered account has a real registration timestamp; placeholders have 0. */
export function isRegistered(profile) {
  return Boolean(profile && profile.registertime > 0)
}

/**
 * Does this username exist on Showdown?
 *
 * Registered accounts are the common case, but unregistered players can still
 * upload replays, so a name with public replays counts as real even with no
 * account. Anything else gets "user not found".
 */
export async function userExists(userId, opts = {}) {
  const profile = await fetchUser(userId, opts)
  if (isRegistered(profile)) return { exists: true, profile }

  let replays = []
  try {
    replays = await searchReplayPage(userId, 1, opts)
  } catch {
    replays = []
  }

  return {
    exists: Array.isArray(replays) && replays.length > 0,
    profile: isRegistered(profile) ? profile : null,
  }
}

/**
 * A format's ladder. Returns up to 500 ranked players — slice for a top N.
 * Each entry: { userid, username, w, l, t, gxe, elo, rpr, ... }
 *
 * A bad formatid does NOT 404; it returns 200 with an empty toplist, so an
 * empty array is how a wrong id shows up.
 */
export async function fetchLadder(formatId, opts = {}) {
  const data = await getJson(
    `${USER_BASE}/ladder/${encodeURIComponent(formatId)}.json`,
    opts,
  )
  return Array.isArray(data?.toplist) ? data.toplist : []
}
