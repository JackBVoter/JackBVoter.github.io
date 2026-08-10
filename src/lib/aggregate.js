// Roll a list of parsed battles up into the numbers the dashboards render.
// Pure functions over plain data — no fetching, no React — so this stays easy
// to reason about and to test.
//
// Widget definitions come from docs/dashboards.md. In particular
// "Most Common Wins/Loses" are about the OPPONENT's Pokémon: what you beat, and
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

  // "Most Used Team" — the player's own Pokémon. A Set because a species should
  // count once per battle even if it somehow appears twice in a log.
  const team = tally(battles, (b) => new Set(b.me.team)).sort(byUsage)

  // Opposing Pokémon, counted once per battle faced. `wins`/`losses` here are
  // the PLAYER's results in battles where that Pokémon was on the other side.
  const opposing = tally(battles, (b) => new Set(b.opponent.team))

  // Same data, two orderings: what you beat most, and what beats you most.
  const commonWins = [...opposing]
    .filter((row) => row.wins > 0)
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.key.localeCompare(b.key))
  const commonLoses = [...opposing]
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
    .map((b) => ({ time: b.uploadTime, elo: b.me.elo, format: b.format, id: b.id }))
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
    team,
    opposing: [...opposing].sort(byUsage),
    commonWins,
    commonLoses,
    rivals,
    teraTypes,
    ratingTimeline,
    firstBattle: times.length ? Math.min(...times) : null,
    lastBattle: times.length ? Math.max(...times) : null,
    // Newest-first slice for an at-a-glance W/L/W/W strip.
    recentForm: battles.slice(0, 20).map((b) => ({ id: b.id, result: b.result })),
  }
}
