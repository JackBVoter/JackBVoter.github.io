// Options for "See Data From How Many Games?".
//
// Plain module rather than living in the component: this is pure logic, and
// keeping it here means it can be imported and tested without a JSX runtime.

// Each step is one HTTP request per replay, so this is the main lever the user
// has over both wait time and load on Showdown.
export const GAME_COUNT_OPTIONS = [25, 50, 100, 200]

export const DEFAULT_GAME_COUNT = 50

/**
 * Is this one of the offered counts?
 *
 * Needed because the selection is remembered across visits (localStorage), so
 * the value reaching the fetch layer can be older than this list — or edited by
 * hand. A count that isn't on the list would leave every button unselected
 * while still driving the request.
 */
export function isGameCount(value) {
  return GAME_COUNT_OPTIONS.includes(value)
}

// isGameCount is about the *list*, not about the player. There is deliberately
// nothing here for "which options can this player fill?" — every option is
// always selectable: a count is a ceiling, and asking for more than exists
// analyzes everything that does. largestUsableCount() and unavailableCounts()
// lived here to grey options out and step the selection down, which pinned a
// player with 58 replays to 50 and hid the other 8. GameCountPicker states the
// shortfall instead.
