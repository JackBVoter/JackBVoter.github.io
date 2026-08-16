import { useEffect, useState } from 'react'

// useState that remembers its value in localStorage.
//
// Why this exists: the sample controls (how many games, whether to include
// unrated ones) were plain component state, so every fresh Player page started
// over at the defaults. Looking at three players in a row meant setting the
// count to 200 three times. These are settings about how the reader wants to
// read, not facts about one player, so they outlive the page.
//
// Deliberately NOT stored this way:
// - the format, which lives in the URL so a dashboard is shareable and a ladder
//   click can carry its own format in.
// - the team filter, which names Pokémon from one player's teams and would be
//   meaningless — usually stale — on the next player.
//
// localStorage rather than sessionStorage so the choice also survives a reload
// and a new tab; there is nothing private in "I like 200-game samples".

const PREFIX = 'trackinch:'

/**
 * Every access is wrapped: localStorage throws rather than returning null in
 * private-browsing modes and when a site's storage is blocked. A remembered
 * preference is a convenience, so failing to read or write one must never be
 * able to take the page down with it.
 */
function read(key, fallback, isValid) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const value = JSON.parse(raw)
    // Stored values are older than the code reading them: a count written when
    // the options were [25, 50, 100, 500] must not come back as a selection no
    // button can show, and hand-edited storage must not reach the fetch layer.
    // Anything unrecognised reads as "never set".
    return isValid(value) ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * @param {string} key - storage key, namespaced with the app prefix
 * @param {*} fallback - value used when nothing valid is stored
 * @param {(value: *) => boolean} isValid - guard against stale or tampered
 *   values; only consulted on the first render, when the stored value is read
 */
export function useStoredState(key, fallback, isValid = () => true) {
  const [value, setValue] = useState(() => read(key, fallback, isValid))

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // Storage unavailable or full. The app keeps working; the choice just
      // won't be there next time.
    }
  }, [key, value])

  return [value, setValue]
}
