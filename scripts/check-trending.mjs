// Check the start page's "Trending now" row: the ranking rules offline, then
// the whole pipeline against live Showdown data.
//
// Offline checks guard the rules that are easy to break quietly:
//   - duplicates across feed pages are counted once
//   - other-server replays (smogtours-, rom-) are not suggested
//   - Free-For-All / Multi battles (4 players) are not counted
//   - formats already in the fixed list are not suggested again
//   - a format below minCount is noise, not a trend
//   - a format with no rated games in the sample is unrated, not a ladder
// The live run prints what the row would show right now, and proves every
// suggested id has a non-empty ladder (a bad id returns 200 + empty toplist).
//
// Read-only GETs to the public API. Run: node scripts/check-trending.mjs

import { fetchRecentReplays, fetchLadder } from '../src/api/showdown.js'
import { SUPPORTED_FORMATS } from '../src/data/formats.js'
import {
  labelFromFormatName,
  rankTrendingFormats,
  sampleWindowMinutes,
} from '../src/lib/trending.js'

let failures = 0
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures += 1
}

// ---- Offline ---------------------------------------------------------------

const two = ['a', 'b']
const r = (id, format = '[Gen 9] Test', players = two, rating = 1200) => ({ id, format, players, rating })
const sample = [
  r('gen9newthing-1', '[Gen 9] New Thing'),
  r('gen9newthing-2', '[Gen 9] New Thing'),
  r('gen9newthing-2', '[Gen 9] New Thing'), // seam duplicate
  r('gen9newthing-3', '[Gen 9] New Thing'),
  r('smogtours-gen9newthing-4'),
  r('smogtours-gen9newthing-5'),
  r('smogtours-gen9newthing-6'),
  r('gen9ffa-1', '[Gen 9] FFA', ['a', 'b', 'c', 'd']),
  r('gen9ffa-2', '[Gen 9] FFA', ['a', 'b', 'c', 'd']),
  r('gen9ffa-3', '[Gen 9] FFA', ['a', 'b', 'c', 'd']),
  r('gen9ou-1'),
  r('gen9ou-2'),
  r('gen9ou-3'),
  r('gen9rare-1'),
  r('gen9rare-2'),
  r('gen9unrated-1', '[Gen 9] Unrated', two, 0),
  r('gen9unrated-2', '[Gen 9] Unrated', two, 0),
  r('gen9unrated-3', '[Gen 9] Unrated', two, 0),
]
const ranked = rankTrendingFormats(sample, { exclude: new Set(['gen9ou']), minCount: 3 })

check('duplicate replay ids counted once', ranked[0]?.id === 'gen9newthing' && ranked[0].count === 3)
check('other-server replays excluded', !ranked.some((f) => f.id.includes('smogtours')))
check('four-player battles excluded', !ranked.some((f) => f.id === 'gen9ffa'))
check('already-offered formats excluded', !ranked.some((f) => f.id === 'gen9ou'))
check('below minCount excluded', !ranked.some((f) => f.id === 'gen9rare'))
check('formats with no rated games excluded', !ranked.some((f) => f.id === 'gen9unrated'))
check('only the expected format survives', ranked.length === 1)
check(
  'label drops the brackets',
  labelFromFormatName('[Gen 9 Champions] VGC 2026 Reg M-C') === 'Gen 9 Champions VGC 2026 Reg M-C',
)

// ---- Live ------------------------------------------------------------------

const replays = []
let before
for (let page = 0; page < 4; page += 1) {
  const batch = await fetchRecentReplays({ before })
  if (!batch.length) break
  replays.push(...batch)
  before = batch.at(-1).uploadtime
}
const unique = new Set(replays.map((x) => x.id)).size
console.log(`\nLive: ${replays.length} feed entries (${unique} unique) over ${sampleWindowMinutes(replays)} minutes`)
check('feed pagination moves back in time (not the same page repeated)', unique > 51)

const candidates = rankTrendingFormats(replays, {
  exclude: new Set(SUPPORTED_FORMATS.map((f) => f.id)),
  limit: 8,
})
for (const candidate of candidates) {
  const ladder = await fetchLadder(candidate.id)
  const shown = ladder.length > 0
  console.log(`  ${shown ? 'show' : 'drop'}  ${String(candidate.count).padStart(3)}x  ${candidate.id}  "${candidate.label}"  ladder ${ladder.length}`)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
