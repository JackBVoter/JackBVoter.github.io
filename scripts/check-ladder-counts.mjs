// Verify the ladder's "Replays" column against live Showdown data.
//
// Three things this is here to check, all of which the column depends on:
//   1. The premise. If most top-100 players had plenty of public replays, a
//      column warning you off them would be clutter.
//   2. The exact-format filter. Showdown matches `format` as a *suffix*, so
//      gen9ou also returns smogtours-gen9ou. Counting the raw page would inflate
//      the number and disagree with the player page, which filters. This prints
//      both counts so the difference is visible rather than assumed.
//   3. That a full first page really means "there are more", i.e. that 51 is the
//      page size and a short page is the last one.
//
// Read-only GETs to the public API. Run: node scripts/check-ladder-counts.mjs

const REPLAY_BASE = 'https://replay.pokemonshowdown.com'
const USER_BASE = 'https://pokemonshowdown.com'
const REPLAYS_PER_PAGE = 51

// How far down the ladder to sample. The whole 100 would be 100 requests; a
// slice is enough to see the distribution.
const SAMPLE = Number(process.argv[3] ?? 25)
const FORMAT = process.argv[2] ?? 'gen9ou'

const formatIdFromReplayId = (id) => String(id ?? '').replace(/-\d+$/, '')

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return res.json()
}

const ladder = await getJson(`${USER_BASE}/ladder/${FORMAT}.json`)
const toplist = Array.isArray(ladder?.toplist) ? ladder.toplist : []
if (toplist.length === 0) {
  console.error(`No toplist for "${FORMAT}" — a bad formatid returns 200 with an empty list.`)
  process.exit(1)
}
console.log(`${FORMAT}: ladder has ${toplist.length} ranked players; sampling top ${SAMPLE}.\n`)

const players = toplist.slice(0, SAMPLE)
const rows = []
let suffixLeaks = 0

// Serial on purpose: this is a check, not the app, and it should not add load.
for (const [index, player] of players.entries()) {
  const params = new URLSearchParams({ user: player.userid, page: '1', format: FORMAT })
  let batch
  try {
    batch = await getJson(`${REPLAY_BASE}/search.json?${params}`)
  } catch (err) {
    console.log(`  #${index + 1} ${player.username}: FAILED — ${err.message}`)
    continue
  }
  const raw = Array.isArray(batch) ? batch : []
  const exactFormat = raw.filter((e) => e?.id && formatIdFromReplayId(e.id) === FORMAT)
  const dropped = raw.length - exactFormat.length
  if (dropped > 0) suffixLeaks += 1

  const complete = raw.length < REPLAYS_PER_PAGE
  rows.push({ rank: index + 1, name: player.username, count: exactFormat.length, complete })

  console.log(
    `  #${String(index + 1).padStart(3)} ${player.username.padEnd(20)} ` +
      `${complete ? String(exactFormat.length).padStart(4) : `${exactFormat.length}+`.padStart(4)}` +
      (dropped > 0
        ? `   (raw page ${raw.length}, ${dropped} dropped as another format: ` +
          `${[...new Set(raw.map((e) => formatIdFromReplayId(e.id)))].filter((f) => f !== FORMAT).join(', ')})`
        : ''),
  )
}

const none = rows.filter((r) => r.complete && r.count === 0).length
const thin = rows.filter((r) => r.complete && r.count > 0 && r.count < 6).length
const some = rows.filter((r) => r.complete && r.count >= 6).length
const many = rows.filter((r) => !r.complete).length

console.log(`
Distribution of ${rows.length} sampled players:
  0 replays        ${none}
  1-5 replays      ${thin}
  6-50 replays     ${some}
  51+ (full page)  ${many}

Wasted clicks the column prevents: ${none + thin} of ${rows.length}.
Players whose raw page leaked another format (the suffix bug): ${suffixLeaks}.`)

if (none + thin === 0) {
  console.log(`
NOTE: nothing thin in this sample — the column's premise is weaker for this
format than it was for the ones that motivated it. Worth re-checking, not
necessarily a failure.`)
}
