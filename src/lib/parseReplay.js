// Turn a raw Showdown replay into the handful of facts our dashboards need.
//
// A replay `log` is the battle protocol: newline-separated `|type|arg|arg` lines.
// We only care about a small subset; everything else (damage, boosts, chat) is
// skipped. Reference: https://github.com/smogon/pokemon-showdown/blob/master/sim/SIM-PROTOCOL.md

import { toUserId } from '../api/showdown.js'

/**
 * Pull the species out of a Showdown "details" string.
 * "Suicune, L82" -> "Suicune"; "Hatterene, L50, F" -> "Hatterene"
 * The species itself never contains a comma, so the first segment is enough.
 */
function speciesFromDetails(details) {
  return String(details ?? '').split(',')[0].trim()
}

/**
 * Split a position token into side, slot and nickname.
 * "p1a: Friendly Giant" -> { side: 'p1', slot: 'a', key: 'p1:Friendly Giant' }
 *
 * The slot letter is the on-field position (doubles/triples use a, b, c). It is
 * not part of a Pokémon's identity, so `key` drops it — but it is returned
 * separately because how many slots a battle uses is the only trustworthy way
 * to tell singles from doubles. See `activePerSide` below.
 */
function parsePosition(token) {
  const raw = String(token ?? '')
  const colon = raw.indexOf(':')
  if (colon === -1) return null

  const side = raw.slice(0, 2) // "p1" / "p2"
  const slot = raw.slice(2, colon) // "a" / "b" / "c"
  const nickname = raw.slice(colon + 1).trim()
  if (side !== 'p1' && side !== 'p2') return null

  return { side, slot, nickname, key: `${side}:${nickname}` }
}

function emptySide(side) {
  return {
    side,
    name: '',
    elo: null,
    team: [],
    revealed: [],
    fainted: [],
    terastallized: null,
  }
}

/**
 * Parse one replay into a normalised battle record from `userId`'s point of view.
 *
 * @param {object} replay - the object returned by fetchReplay()
 * @param {string} userId - normalised userid of the player we are analyzing
 * @returns {object|null} null when the log is unusable or the user isn't in it
 */
export function parseReplay(replay, userId) {
  if (!replay || typeof replay.log !== 'string') return null

  // Free-For-All formats put four players in one battle (|player|p3|, |player|p4|).
  // Every dashboard we build assumes a single opponent — "what beats you",
  // head-to-head records — so a 4-way battle has no meaningful answer to those
  // questions. Skip it explicitly rather than silently treating p1 vs p2 as the
  // whole story, which would attribute losses to the wrong player.
  if (
    (Array.isArray(replay.players) && replay.players.length > 2) ||
    /\|player\|p[34]\|/.test(replay.log)
  ) {
    return null
  }

  const sides = { p1: emptySide('p1'), p2: emptySide('p2') }
  // "p1:Nickname" -> species, so |faint|p1a: Bird can be resolved to Tornadus-Therian.
  const nicknames = new Map()

  let turns = 0
  let winnerName = null
  let tie = false
  let forfeited = false
  let forfeitedBy = null
  // Distinct on-field slot letters. One = singles, two = doubles, three =
  // triples. Derived from the log rather than the format name, because the
  // names can't be enumerated reliably — gen9championsvgc2026regmb and
  // gen9championsvgc2026regmbbo3 are both doubles and neither says "doubles".
  const slotsSeen = new Set()
  let rated = false
  let tier = replay.format ?? ''

  for (const line of replay.log.split('\n')) {
    if (!line.startsWith('|')) continue
    const parts = line.split('|')
    const type = parts[1]

    switch (type) {
      case 'player': {
        // |player|p1|Goodisgood|bruno|1084  (avatar and rating may be absent)
        const side = parts[2]
        if (side !== 'p1' && side !== 'p2') break
        if (parts[3]) sides[side].name = parts[3]
        const elo = Number(parts[5])
        if (Number.isFinite(elo) && elo > 0) sides[side].elo = elo
        break
      }

      case 'poke': {
        // |poke|p1|Corviknight, M|  — the team preview reveal
        const side = parts[2]
        if (side !== 'p1' && side !== 'p2') break
        const species = speciesFromDetails(parts[3])
        if (species && !sides[side].team.includes(species)) {
          sides[side].team.push(species)
        }
        break
      }

      case 'switch':
      case 'drag':
      case 'replace': {
        // |switch|p1a: Friendly Giant|Dragonite, F|100/100
        const pos = parsePosition(parts[2])
        const species = speciesFromDetails(parts[3])
        if (!pos || !species) break
        if (pos.slot) slotsSeen.add(pos.slot)
        nicknames.set(pos.key, species)
        if (!sides[pos.side].revealed.includes(species)) {
          sides[pos.side].revealed.push(species)
        }
        break
      }

      case 'faint': {
        const pos = parsePosition(parts[2])
        if (!pos) break
        // Fall back to the nickname when we never saw the switch-in.
        sides[pos.side].fainted.push(nicknames.get(pos.key) ?? pos.nickname)
        break
      }

      case '-terastallize': {
        // |-terastallize|p2b: Passimian|Ground
        const pos = parsePosition(parts[2])
        if (!pos) break
        sides[pos.side].terastallized = {
          species: nicknames.get(pos.key) ?? pos.nickname,
          type: parts[3] ?? null,
        }
        break
      }

      case 'turn': {
        const n = Number(parts[2])
        if (Number.isFinite(n)) turns = Math.max(turns, n)
        break
      }

      case 'win':
        winnerName = parts[2] ?? null
        break

      case 'tie':
        tie = true
        break

      case 'rated':
        rated = true
        break

      case 'tier':
        tier = parts[2] ?? tier
        break

      case '-message': {
        // |-message|MaxDOM forfeited.
        const message = parts[2] ?? ''
        if (/forfeited/i.test(message)) {
          forfeited = true
          // Keep the name: "someone forfeited" can't say whether the player
          // gave up or was given the win, and those read very differently next
          // to a result. First one wins — a battle only ends once.
          forfeitedBy ??= message.replace(/\s*forfeited\.?\s*$/i, '').trim()
        }
        break
      }

      default:
        break
    }
  }

  // Which side is the player we're analyzing? Prefer the names in the log, and
  // fall back to the metadata player list for logs with malformed |player| lines.
  let mySide = null
  if (toUserId(sides.p1.name) === userId) mySide = 'p1'
  else if (toUserId(sides.p2.name) === userId) mySide = 'p2'
  else if (Array.isArray(replay.players)) {
    const index = replay.players.findIndex((p) => toUserId(p) === userId)
    if (index === 0) mySide = 'p1'
    else if (index === 1) mySide = 'p2'
  }
  if (!mySide) return null

  const oppSide = mySide === 'p1' ? 'p2' : 'p1'
  const me = sides[mySide]
  const opp = sides[oppSide]

  let result = 'unknown'
  if (tie) result = 'tie'
  else if (winnerName) {
    result = toUserId(winnerName) === userId ? 'win' : 'loss'
  }

  // Team preview is absent in some formats; the Pokémon we actually saw is the
  // best available stand-in for a team list.
  const teamOf = (s) => (s.team.length ? s.team : s.revealed)

  // Whether that stand-in was needed. Callers that identify a *team* (rather
  // than count individual Pokémon) need to know: without team preview the list
  // is only who got sent out, so the same team looks different every battle and
  // can never be matched against itself.
  const previewed = (s) => s.team.length > 0

  // Which side gave up. The forfeit message carries a display name, so match it
  // the same way winners are matched. Null when nobody forfeited, or when the
  // name in the message doesn't resolve to either player.
  const forfeitId = forfeitedBy ? toUserId(forfeitedBy) : null
  const iForfeited = forfeitId !== null && forfeitId === userId
  const oppForfeited =
    forfeitId !== null && forfeitId === toUserId(opp.name || '')

  return {
    id: replay.id,
    format: tier || replay.format || 'Unknown format',
    formatId: replay.formatid ?? '',
    uploadTime: replay.uploadtime ? replay.uploadtime * 1000 : null,
    rating: Number.isFinite(replay.rating) ? replay.rating : null,
    rated,
    turns,
    result,
    forfeited,
    // 1 = singles, 2 = doubles, 3 = triples. Null when the log had no switch
    // lines at all (an incomplete upload) — callers must treat that as unknown
    // rather than defaulting to singles.
    activePerSide: slotsSeen.size || null,
    me: {
      name: me.name || replay.players?.[mySide === 'p1' ? 0 : 1] || '',
      elo: me.elo,
      forfeited: iForfeited,
      team: teamOf(me),
      teamPreviewed: previewed(me),
      revealed: me.revealed,
      fainted: me.fainted,
      terastallized: me.terastallized,
    },
    opponent: {
      name: opp.name || replay.players?.[oppSide === 'p1' ? 0 : 1] || '',
      elo: opp.elo,
      forfeited: oppForfeited,
      team: teamOf(opp),
      teamPreviewed: previewed(opp),
      revealed: opp.revealed,
      fainted: opp.fainted,
      terastallized: opp.terastallized,
    },
  }
}
