// Roll a list of parsed battles up into the numbers the dashboards render.
// Pure functions over plain data — no fetching, no React — so this stays easy
// to reason about and to test.
//
// Widget definitions come from docs/dashboards.md. In particular
// "Most Common Wins/Losses" are about the OPPONENT's Pokémon: what you beat, and
// what beats you.

function rate(wins, decided) {
  return decided > 0 ? wins / decided : 0
}

/**
 * Generic "count wins and losses per key" helper. `keysOf` returns the buckets a
 * battle contributes to (one for format, up to six for team members, and so on).
 */
function tally(battles, keysOf) {
  const map = new Map()

  for (const battle of battles) {
    for (const key of keysOf(battle)) {
      if (!key) continue
      let row = map.get(key)
      if (!row) {
        row = { key, battles: 0, wins: 0, losses: 0, ties: 0 }
        map.set(key, row)
      }
      row.battles += 1
      if (battle.result === 'win') row.wins += 1
      else if (battle.result === 'loss') row.losses += 1
      else if (battle.result === 'tie') row.ties += 1
    }
  }

  return [...map.values()].map((row) => ({
    ...row,
    // Undecided battles shouldn't drag a win rate down, so rate over decided only.
    decided: row.wins + row.losses,
    winRate: rate(row.wins, row.wins + row.losses),
  }))
}

/** Most battles first; ties broken by win rate so the ordering is stable. */
function byUsage(a, b) {
  return b.battles - a.battles || b.winRate - a.winRate || a.key.localeCompare(b.key)
}

/**
 * Is this a singles or a doubles format?
 *
 * Decided across the whole sample rather than per battle. An incomplete upload
 * has no switch lines and so reports nothing, but one silent replay among
 * dozens can't outvote the rest — measured on live data, 24 of 25 OU replays
 * and 25 of 25 VGC replays gave a usable signal.
 *
 * Because the page is always scoped to one format, the answer should be
 * unanimous; a format is singles or doubles by definition. A split verdict
 * means something is wrong, so it resolves to null (unknown) rather than
 * quietly taking the majority and showing the wrong buckets.
 */
function detectBattleStyle(battles) {
  const counts = new Map()
  for (const battle of battles) {
    if (!battle.activePerSide) continue
    counts.set(battle.activePerSide, (counts.get(battle.activePerSide) ?? 0) + 1)
  }
  if (counts.size !== 1) return null

  const [active] = counts.keys()
  return active === 1 ? 'singles' : active === 2 ? 'doubles' : 'triples'
}

// How long a game runs means completely different things in the two styles:
// doubles resolves far faster because twice as much happens per turn. Sharing
// one set of thresholds would put every doubles game in the shortest bucket.
const LENGTH_BUCKETS = {
  singles: [
    { key: 'Under 20 turns', max: 19 },
    { key: '20–39 turns', max: 39 },
    { key: '40–74 turns', max: 74 },
    { key: '75+ turns', max: Infinity },
  ],
  doubles: [
    { key: '5 turns or fewer', max: 5 },
    { key: '6–10 turns', max: 10 },
    { key: '11+ turns', max: Infinity },
  ],
}
// Triples is doubles-like in pace and far too rare to justify its own scale.
LENGTH_BUCKETS.triples = LENGTH_BUCKETS.doubles

/**
 * "Win Rate by Game Length" — results grouped into turn-count bands.
 *
 * Returned in ascending length order, NOT ranked by usage: the shape of the
 * series is the point ("I lose the long ones"), and sorting by battle count
 * would scramble it.
 *
 * Battles with no recorded turn count are excluded rather than counted as
 * zero-turn games, which would pile incomplete uploads into the shortest
 * bucket and drag its win rate toward nonsense.
 */
function winRateByLength(battles, style) {
  const buckets = LENGTH_BUCKETS[style]
  if (!buckets) return []

  const rows = buckets.map((bucket) => ({
    key: bucket.key,
    battles: 0,
    wins: 0,
    losses: 0,
    ties: 0,
  }))

  for (const battle of battles) {
    if (!battle.turns) continue
    const index = buckets.findIndex((bucket) => battle.turns <= bucket.max)
    if (index === -1) continue
    const row = rows[index]
    row.battles += 1
    if (battle.result === 'win') row.wins += 1
    else if (battle.result === 'loss') row.losses += 1
    else if (battle.result === 'tie') row.ties += 1
  }

  return rows.map((row) => ({
    ...row,
    decided: row.wins + row.losses,
    winRate: rate(row.wins, row.wins + row.losses),
  }))
}

/**
 * Which team the player brought in one battle, as a stable identity string, or
 * null when the replay can't say.
 *
 * Only battles with team preview can answer. Without it (Random Battle, and any
 * other format with no `|poke|` lines) `me.team` is just whoever got sent out,
 * so the same team reads as a different set every battle. Better to say nothing
 * than to invent a team that was never brought.
 *
 * Members are sorted so that bring order can't split one team across two rows,
 * and that sorted list doubles as the key.
 *
 * Exported because the player page filters battles by team, and that filter has
 * to use exactly the same identity rule as the tally below. Two definitions
 * would mean a row reading "12 battles" that filters down to 11.
 */
export function teamKeyOf(battle) {
  if (!battle.me.teamPreviewed || battle.me.team.length === 0) return null
  return [...new Set(battle.me.team)].sort().join('|')
}

/**
 * Whole teams the player brought, most-used first — one row per distinct set of
 * six, not per Pokémon.
 */
function teamsUsed(battles) {
  const map = new Map()

  for (const battle of battles) {
    const key = teamKeyOf(battle)
    if (!key) continue

    let row = map.get(key)
    if (!row) {
      row = {
        key,
        members: key.split('|'),
        battles: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        lastUsed: null,
      }
      map.set(key, row)
    }
    row.battles += 1
    if (battle.result === 'win') row.wins += 1
    else if (battle.result === 'loss') row.losses += 1
    else if (battle.result === 'tie') row.ties += 1
    if (battle.uploadTime && battle.uploadTime > (row.lastUsed ?? 0)) {
      row.lastUsed = battle.uploadTime
    }
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      decided: row.wins + row.losses,
      winRate: rate(row.wins, row.wins + row.losses),
    }))
    .sort(byUsage)
}

/**
 * Longest run of wins, plus the streak the player is currently on.
 * Expects `battles` sorted newest-first (the order Showdown returns them).
 */
function streaks(battles) {
  const chronological = [...battles].reverse()

  let longestWin = 0
  let run = 0
  for (const battle of chronological) {
    if (battle.result === 'win') {
      run += 1
      longestWin = Math.max(longestWin, run)
    } else if (battle.result === 'loss') {
      run = 0
    }
  }

  // Current streak: walk back from the most recent decided battle.
  let current = 0
  let currentType = null
  for (const battle of battles) {
    if (battle.result !== 'win' && battle.result !== 'loss') continue
    if (currentType === null) currentType = battle.result
    if (battle.result !== currentType) break
    current += 1
  }

  return { longestWin, current, currentType }
}

/**
 * @param {object[]} battles - parseReplay() output, newest first
 * @returns {object} everything the dashboards need
 */
export function aggregate(battles) {
  const total = battles.length
  const wins = battles.filter((b) => b.result === 'win').length
  const losses = battles.filter((b) => b.result === 'loss').length
  const ties = battles.filter((b) => b.result === 'tie').length

  const formats = tally(battles, (b) => [b.format]).sort(byUsage)

  // "Most Used Team" — whole teams, one row per distinct six.
  const teams = teamsUsed(battles)

  const battleStyle = detectBattleStyle(battles)
  const lengthBands = winRateByLength(battles, battleStyle)
  // Games with no turn count can't be placed in a band; surfaced so the widget
  // can account for a total that doesn't match the headline battle count.
  const battlesWithoutTurns = battles.filter((b) => !b.turns).length

  // Battles that couldn't contribute a team, so the widget can say why its
  // sample is smaller than the headline battle count instead of silently
  // dropping games.
  const battlesWithoutTeamPreview = battles.filter((b) => !b.me.teamPreviewed).length

  // Opposing Pokémon, counted once per battle faced. `wins`/`losses` here are
  // the PLAYER's results in battles where that Pokémon was on the other side.
  const opposing = tally(battles, (b) => new Set(b.opponent.team))

  // Same data, two orderings: what you beat most, and what beats you most.
  const commonWins = [...opposing]
    .filter((row) => row.wins > 0)
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.key.localeCompare(b.key))
  const commonLosses = [...opposing]
    .filter((row) => row.losses > 0)
    .sort((a, b) => b.losses - a.losses || a.winRate - b.winRate || a.key.localeCompare(b.key))

  // "Players who beat you more than once" — opponents with 2+ wins over you.
  // `losses` on an opponent row means battles the player lost to them.
  const rivals = tally(battles, (b) => [b.opponent.name])
    .filter((row) => row.key && row.losses >= 2)
    .sort((a, b) => b.losses - a.losses || a.wins - b.wins || a.key.localeCompare(b.key))

  const teraTypes = tally(battles, (b) =>
    b.me.terastallized?.type ? [b.me.terastallized.type] : [],
  ).sort(byUsage)

  const withTurns = battles.filter((b) => b.turns > 0)
  const totalTurns = withTurns.reduce((sum, b) => sum + b.turns, 0)
  const longestBattle = withTurns.reduce(
    (best, b) => (!best || b.turns > best.turns ? b : best),
    null,
  )

  // Rated battles carry the Elo the player entered the game with; that series is
  // the closest thing to a ladder history the replay API exposes.
  const ratingTimeline = battles
    .filter((b) => b.me.elo && b.uploadTime)
    .map((b) => ({
      time: b.uploadTime,
      elo: b.me.elo,
      format: b.format,
      id: b.id,
      // For the chart's tooltip. Not encoded as colour — the line is one series
      // and the result is a detail you get on hover.
      result: b.result,
    }))
    .sort((a, b) => a.time - b.time)

  const knockedOut = battles.reduce((sum, b) => sum + b.opponent.fainted.length, 0)
  const lostMons = battles.reduce((sum, b) => sum + b.me.fainted.length, 0)

  const times = battles.map((b) => b.uploadTime).filter(Boolean)

  return {
    totals: {
      battles: total,
      wins,
      losses,
      ties,
      decided: wins + losses,
      winRate: rate(wins, wins + losses),
      forfeits: battles.filter((b) => b.forfeited).length,
    },
    streaks: streaks(battles),
    turns: {
      average: withTurns.length ? totalTurns / withTurns.length : 0,
      longest: longestBattle,
    },
    knockouts: {
      dealt: knockedOut,
      taken: lostMons,
      perBattle: total ? knockedOut / total : 0,
    },
    formats,
    teams,
    battlesWithoutTeamPreview,
    // 'singles' | 'doubles' | 'triples' | null. Null means the sample couldn't
    // say, so anything style-specific should hide rather than guess.
    battleStyle,
    lengthBands,
    battlesWithoutTurns,
    opposing: [...opposing].sort(byUsage),
    commonWins,
    commonLosses,
    rivals,
    teraTypes,
    ratingTimeline,
    firstBattle: times.length ? Math.min(...times) : null,
    lastBattle: times.length ? Math.max(...times) : null,
    // Newest-first slice for an at-a-glance W/L/W/W strip.
    recentForm: battles.slice(0, 20).map((b) => ({ id: b.id, result: b.result })),
  }
}
