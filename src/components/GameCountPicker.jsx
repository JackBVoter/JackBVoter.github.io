import { ButtonGroup, ToggleButton } from 'react-bootstrap'

import { GAME_COUNT_OPTIONS } from '../lib/gameCounts.js'

/**
 * "See Data From How Many Games?" — from the Figma design.
 *
 * Every option is always selectable, even one the player can't fill. Asking for
 * 100 when 58 exist analyses all 58 and says so; the count is a ceiling, not a
 * promise. An earlier version disabled those options and silently stepped the
 * selection back down, which left a player with 58 replays stuck on 50 and
 * unable to see the other 8 — the control was protecting them from a number
 * they were entitled to.
 *
 * The honesty problem that behaviour was solving is real, though: "100" must
 * never imply a 100-game sample when it delivered 58. So the shortfall is
 * stated plainly instead of being prevented.
 *
 * The count is always games *of the selected format*, so the copy says so —
 * "50 games" reading as 50 replays split across every format a player touched
 * was the confusion this wording exists to prevent.
 *
 * The "only publicly uploaded replays" caveat is permanent rather than a
 * loading placeholder. It is the single most important limitation of every
 * number on the page, and it was previously replaced by the replay count the
 * moment the data arrived — that is, it vanished exactly when the statistics
 * it qualifies appeared.
 *
 * @param {number|null} available - replays in the selected format, or null
 *   while loading
 */
function GameCountPicker({ value, onChange, available = null, disabled = false }) {
  const known = typeof available === 'number'
  // The selection asks for more than exists. Not an error — just a ceiling the
  // player should know about, since it caps every statistic on the page.
  const short = known && value > available

  return (
    <div>
      <div className="text-uppercase text-muted small fw-semibold mb-2">
        See Data From How Many Games?
      </div>

      <ButtonGroup>
        {GAME_COUNT_OPTIONS.map((count) => {
          const exceedsAvailable = known && count > available
          return (
            <ToggleButton
              key={count}
              id={`game-count-${count}`}
              type="radio"
              name="game-count"
              variant={count === value ? 'primary' : 'outline-primary'}
              value={count}
              checked={count === value}
              disabled={disabled}
              title={
                exceedsAvailable
                  ? `Only ${available} replays in this format — selecting ${count} analyzes all ${available}`
                  : `Analyze the ${count} most recent replays in this format`
              }
              onChange={() => onChange(count)}
            >
              {count}
            </ToggleButton>
          )
        })}
      </ButtonGroup>

      {short ? (
        <div className="text-warning-emphasis fw-semibold small mt-2">
          Only {available} {available === 1 ? 'replay' : 'replays'} available in
          this format — analyzing {available === 1 ? 'it' : 'all of them'}.
        </div>
      ) : known ? (
        <div className="text-muted small mt-2">
          {available} public {available === 1 ? 'replay' : 'replays'} in this
          format.
        </div>
      ) : null}

      {/* Stays on screen in every state, not just while loading. Once the
          numbers are up they look authoritative, and this is the moment the
          reader most needs to know what they don't cover: a player's public
          replays are the ones they chose to upload, which can be a small and
          unrepresentative slice of what they actually played. */}
      <div className="text-muted small mt-1">
        Only publicly uploaded replays can be analyzed — a player may have
        played many more games than this. We analyze what&apos;s available.
      </div>
    </div>
  )
}

export default GameCountPicker
