import { ButtonGroup, ToggleButton } from 'react-bootstrap'

import { GAME_COUNT_OPTIONS } from '../lib/gameCounts.js'

/**
 * "See Data From How Many Games?" — from the Figma design.
 *
 * Options the player can't actually fill are disabled. Offering "200" to
 * someone with 30 replays implies a 200-game sample and quietly delivers 30,
 * which is exactly the kind of misleading number a stats site shouldn't print.
 *
 * @param {number|null} available - public replays found, or null while loading
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
                  ? `Only ${available} replays available`
                  : `Analyse the ${count} most recent replays`
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
          only: {available} {available === 1 ? 'replay' : 'replays'} available
        </div>
      ) : known ? (
        <div className="text-muted small mt-2">
          {available} public {available === 1 ? 'replay' : 'replays'} available.
        </div>
      ) : (
        <div className="text-muted small mt-2">
          A player may have fewer public replays than this — we analyse whatever
          exists.
        </div>
      )}
    </div>
  )
}

export default GameCountPicker
