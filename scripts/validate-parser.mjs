// Validate parseReplay.js against live Pokémon Showdown replays.
//   node scripts/validate-parser.mjs [sampleSize]
//
// The parser is the foundation under every player-page widget, and battle logs
// vary a lot in practice (singles vs doubles slots, nicknamed Pokémon, formats
// without team preview, forfeits, ties). Unit tests on a handful of hand-written
// logs would not catch that variety, so this checks invariants against whatever
// is actually on the ladder right now.
//
// Read-only: fetches public replays and writes nothing outside this project.
// Uses Node's built-in fetch — no dependencies.

import { parseReplay } from '../src/lib/parseReplay.js'
import { toUserId } from '../src/api/showdown.js'
import { mapWithConcurrency, successes } from '../src/lib/pool.js'

const SAMPLE = Number(process.argv[2]) || 24
const BASE = 'https://replay.pokemonshowdown.com'

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const problems = []
const notes = []
function fail(replayId, message) {
  problems.push(`${replayId}: ${message}`)
}

/**
 * Every check is an invariant that must hold for a correctly parsed replay,
 * expressed without reference to the parser's internals.
 */
function checkReplay(replay) {
  const [nameA, nameB] = replay.players ?? []
  if (!nameA || !nameB) {
    notes.push(`${replay.id}: metadata has no player pair, skipped`)
    return
  }

  const a = parseReplay(replay, toUserId(nameA))
  const b = parseReplay(replay, toUserId(nameB))

  // Free-For-All battles have no single opponent, so the parser declines them.
  // Assert that it declines rather than guessing.
  const isMultiPlayer =
    replay.players.length > 2 || /\|player\|p[34]\|/.test(replay.log)
  if (isMultiPlayer) {
    if (a !== null || b !== null) {
      fail(replay.id, 'multi-player (FFA) battle was parsed as 1v1 instead of skipped')
    } else {
      notes.push(`${replay.id}: FFA/multi-player, correctly skipped`)
    }
    return
  }

  if (!a || !b) {
    fail(replay.id, `parseReplay returned null for ${!a ? nameA : nameB}`)
    return
  }

  // 1. Each perspective must be anchored to the right player.
  if (toUserId(a.me.name) !== toUserId(nameA)) {
    fail(replay.id, `perspective A resolved to "${a.me.name}", expected "${nameA}"`)
  }
  if (toUserId(a.opponent.name) !== toUserId(nameB)) {
    fail(replay.id, `A's opponent is "${a.opponent.name}", expected "${nameB}"`)
  }

  // 2. The two perspectives must be mirror images.
  const mirrored = { win: 'loss', loss: 'win', tie: 'tie', unknown: 'unknown' }
  if (mirrored[a.result] !== b.result) {
    fail(replay.id, `results not symmetric: A=${a.result} B=${b.result}`)
  }

  // 3. A decided battle needs a winner, and it must be one of the two players.
  if (a.result === 'unknown' && !replay.log.includes('|tie')) {
    notes.push(`${replay.id}: no |win| line (incomplete upload?)`)
  }

  for (const [side, label] of [[a, 'A'], [b, 'B']]) {
    // 4. Team sizes must be sane. Six is the cap in every supported format.
    if (side.me.team.length === 0) {
      fail(replay.id, `${label}: empty team`)
    } else if (side.me.team.length > 6) {
      fail(replay.id, `${label}: team of ${side.me.team.length} (>6)`)
    }

    // 5. The strongest check: every fainted Pokémon should have resolved from a
    //    nickname to a real species. If nickname mapping failed, the raw
    //    nickname leaks through and won't be in the revealed list.
    for (const fainted of side.me.fainted) {
      const known =
        side.me.revealed.includes(fainted) || side.me.team.includes(fainted)
      if (!known) {
        fail(replay.id, `${label}: fainted "${fainted}" is not a known species (nickname unresolved)`)
      }
    }

    // 6. You cannot lose more Pokémon than you brought.
    if (side.me.fainted.length > 6) {
      fail(replay.id, `${label}: ${side.me.fainted.length} faints (>6)`)
    }
  }

  // 7. A battle that reached a result should have turns.
  if (a.result !== 'unknown' && a.turns === 0) {
    notes.push(`${replay.id}: decided but 0 turns (${a.format})`)
  }

  return { a, b }
}

console.log(`Fetching ${SAMPLE} recent replays…`)
const recent = await getJson(`${BASE}/search.json`)
const chosen = recent.slice(0, SAMPLE)

const results = await mapWithConcurrency(
  chosen,
  (entry) => getJson(`${BASE}/${entry.id}.json`),
  { concurrency: 4 },
)
const replays = successes(results)
console.log(`Downloaded ${replays.length}/${chosen.length}\n`)

const parsed = []
const formats = new Map()
for (const replay of replays) {
  const out = checkReplay(replay)
  if (out) {
    parsed.push(out.a)
    formats.set(out.a.format, (formats.get(out.a.format) ?? 0) + 1)
  }
}

// Show the spread so it is obvious whether doubles/VGC logs were exercised.
console.log('Formats covered:')
for (const [format, n] of [...formats].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${n}x  ${format}`)
}

console.log('\nSample of parsed output:')
for (const battle of parsed.slice(0, 3)) {
  console.log(
    `  ${battle.id}\n` +
      `    ${battle.me.name} vs ${battle.opponent.name} — ${battle.result}, ${battle.turns} turns\n` +
      `    team: ${battle.me.team.join(', ') || '(none)'}\n` +
      `    lost: ${battle.me.fainted.join(', ') || '(none)'}` +
      (battle.me.terastallized ? `\n    tera: ${battle.me.terastallized.species} → ${battle.me.terastallized.type}` : ''),
  )
}

if (notes.length) {
  console.log(`\nNotes (not failures) — ${notes.length}:`)
  for (const note of notes.slice(0, 10)) console.log(`  ${note}`)
}

console.log(
  problems.length === 0
    ? `\nOK — ${parsed.length} replays parsed, all invariants held.`
    : `\n${problems.length} PROBLEMS:\n` + problems.map((p) => `  ${p}`).join('\n'),
)
process.exit(problems.length === 0 ? 0 : 1)
