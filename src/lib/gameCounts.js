// Options for "See Data From How Many Games?".
//
// Plain module rather than living in the component: this is pure logic, and
// keeping it here means it can be imported and tested without a JSX runtime.

// Each step is one HTTP request per replay, so this is the main lever the user
// has over both wait time and load on Showdown.
export const GAME_COUNT_OPTIONS = [25, 50, 100, 200]

export const DEFAULT_GAME_COUNT = 50

/**
 * The largest option a player with `available` replays can actually fill.
 * Returns null when they have fewer replays than even the smallest option —
 * the caller should then say how many they really have rather than offering a
 * choice that can't be honoured.
 */
export function largestUsableCount(available) {
  let best = null
  for (const count of GAME_COUNT_OPTIONS) {
    if (count <= available) best = count
  }
  return best
}

/** Options that can't be filled, and so should be greyed out. */
export function unavailableCounts(available) {
  return GAME_COUNT_OPTIONS.filter((count) => count > available)
}
