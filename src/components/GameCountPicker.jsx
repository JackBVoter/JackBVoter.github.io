import { ButtonGroup, ToggleButton } from 'react-bootstrap'

import { GAME_COUNT_OPTIONS } from '../lib/gameCounts.js'

/**
 * "See Data From How Many Games?" — from the Figma design.
 *
 * Options the player can't actually fill are disabled. Offering "200" to
 * someone with 30 replays implies a 200-game sample and quietly delivers 30,
 * which is exactly the kind of misleading number a stats site shouldn't print.
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
  // Below the smallest option there is nothing meaningful to choose.
  const tooFewForAnyOption = known && available < GAME_COUNT_OPTIONS[0]

  return (
    <div>
      <div className="text-uppercase text-muted small fw-semibold mb-2">
        See Data From How Many Games?
      </div>

      <ButtonGroup>
        {GAME_COUNT_OPTIONS.map((count) => {
          const unavailable = known && count > available
          return (
            <ToggleButton
              key={count}
              id={`game-count-${count}`}
              type="radio"
              name="game-count"
              variant={count === value && !unavailable ? 'primary' : 'outline-primary'}
              value={count}
              checked={count === value}
              disabled={disabled || unavailable}
              title={
                unavailable
                  ? `Only ${available} replays in this format`
                  : `Analyse the ${count} most recent replays in this format`
              }
              onChange={() => onChange(count)}
            >
              {count}
            </ToggleButton>
          )
        })}
      </ButtonGroup>

      {tooFewForAnyOption ? (
        <div className="text-warning-emphasis fw-semibold small mt-2">
          only: {available} {available === 1 ? 'replay' : 'replays'} in this format
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
        Only publicly uploaded replays can be analysed — a player may have
        played many more games than this. We analyse what&apos;s available.
      </div>
    </div>
  )
}

export default GameCountPicker
