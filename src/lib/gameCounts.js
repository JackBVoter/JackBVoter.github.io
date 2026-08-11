// Options for "See Data From How Many Games?".
//
// Plain module rather than living in the component: this is pure logic, and
// keeping it here means it can be imported and tested without a JSX runtime.

// Each step is one HTTP request per replay, so this is the main lever the user
// has over both wait time and load on Showdown.
export const GAME_COUNT_OPTIONS = [25, 50, 100, 200]

export const DEFAULT_GAME_COUNT = 50

// There is deliberately nothing here for "which options can this player fill?".
// Every option is always selectable: a count is a ceiling, and asking for more
// than exists analyzes everything that does. largestUsableCount() and
// unavailableCounts() lived here to grey options out and step the selection
// down, which pinned a player with 58 replays to 50 and hid the other 8.
// GameCountPicker states the shortfall instead.
