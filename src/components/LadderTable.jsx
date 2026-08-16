import { useEffect, useState } from 'react'
import { Alert, Card, Spinner, Table } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'

import { LOW_REPLAY_COUNT, useReplayCounts } from '../hooks/useReplayCounts.js'

/**
 * How many public replays this player has in this format.
 *
 * Being ranked in a top 100 says nothing about whether you can analyze someone —
 * uploading a replay is opt-in, and plenty of strong players never do it. Without
 * this column the only way to find that out was to open the dashboard and be told
 * there was nothing there.
 *
 * Four states, and the difference between the last two matters:
 *   - not asked yet (the row hasn't been scrolled to)
 *   - loading
 *   - an exact count, when page 1 was the player's whole history
 *   - a floor ("51+"), when there are more pages behind it. Never shown as a
 *     total, because it isn't one.
 */
function ReplayCount({ value }) {
  if (!value) {
    // Deliberately not a spinner: 100 rows of spinning would read as the whole
    // table loading, when in fact nothing has been asked for yet.
    return (
      <span className="text-muted" title="Not counted yet — scroll to this row to load it">
        ·
      </span>
    )
  }

  if (value.loading) {
    return (
      <Spinner
        animation="border"
        // Bootstrap's small spinner is still 1rem, which crowds a compact row.
        style={{ width: '0.7rem', height: '0.7rem', borderWidth: '0.1rem' }}
        role="status"
        aria-label="Counting replays"
      />
    )
  }

  if (value.failed) {
    return (
      <span className="text-muted" title="Couldn't load this player's replay list">
        ?
      </span>
    )
  }

  const { count, exact } = value

  if (count === 0) {
    // The whole reason the column exists. Say it in a word rather than as a "0"
    // to be squinted at in a column of numbers.
    return (
      <span
        className="text-muted fst-italic"
        title="No public replays in this format — nothing to analyze"
      >
        none
      </span>
    )
  }

  const label = exact ? String(count) : `${count}+`
  const thin = exact && count < LOW_REPLAY_COUNT

  return (
    <span
      className={thin ? 'text-warning-emphasis' : undefined}
      title={
        exact
          ? `${count} public ${count === 1 ? 'replay' : 'replays'} in this format${
              thin ? ' — a small sample' : ''
            }`
          : `More than ${count} public replays in this format (we stop counting at the first page)`
      }
    >
      {label}
    </span>
  )
}

/**
 * The top 100 players on a format's ladder, scrollable.
 * Clicking a row opens that player's dashboards — the same destination as
 * typing their name into the search box.
 */
function LadderTable({ formatId, formatLabel, players, loading, error }) {
  const navigate = useNavigate()
  const { request, release, countFor } = useReplayCounts(formatId)

  // State rather than a ref: the observer can't be created until the scroll
  // container exists, and a ref assignment wouldn't re-run the effect.
  const [scrollEl, setScrollEl] = useState(null)

  // Counts cost one request per player, so only rows that reach the viewport ask
  // for one. One observer for the table rather than one per row, with the userid
  // carried on the element — no 100 refs to wire up.
  useEffect(() => {
    if (!scrollEl) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const { userid } = entry.target.dataset
          if (!userid) continue
          if (entry.isIntersecting) request(userid)
          else release(userid)
        }
      },
      {
        root: scrollEl,
        // A screen's worth of lead time, so the number is usually already there
        // by the time a row is actually readable.
        rootMargin: '150px 0px',
      },
    )

    for (const row of scrollEl.querySelectorAll('tr[data-userid]')) {
      observer.observe(row)
    }

    return () => observer.disconnect()
    // `players` because a new ladder means new rows to observe. `request` and
    // `release` are stable per format, so an arriving count doesn't rebuild this.
  }, [scrollEl, players, request, release])

  // Carry the format through, so a player opened from this ladder is analyzed
  // in this format rather than across their whole history. Being ranked here
  // doesn't mean they upload replays here — the page has to be able to say
  // "no replays in this format" instead of quietly showing another one's.
  function openPlayer(userid) {
    navigate(`/player/${userid}?format=${encodeURIComponent(formatId)}`)
  }

  return (
    <Card className="h-100 shadow-sm">
      <Card.Header className="fw-semibold">
        Top 100 — {formatLabel}
      </Card.Header>

      {loading ? (
        <Card.Body className="text-center text-muted py-5">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading ladder…
        </Card.Body>
      ) : error ? (
        <Card.Body>
          <Alert variant="danger" className="mb-0">
            Couldn&apos;t load the ladder. {error.message}
          </Alert>
        </Card.Body>
      ) : players.length === 0 ? (
        <Card.Body className="text-muted">
          No ranked players returned for this format.
        </Card.Body>
      ) : (
        // Fixed height so the box scrolls rather than pushing the page down.
        // It is also the observer's root: "visible" has to mean visible in this
        // box, not in the browser window.
        <div ref={setScrollEl} style={{ maxHeight: '28rem', overflowY: 'auto' }}>
          <Table hover size="sm" className="mb-0 align-middle">
            <thead className="table-light position-sticky top-0">
              <tr>
                <th style={{ width: '3rem' }}>#</th>
                <th>Player</th>
                <th className="text-end">Elo</th>
                {/* Kept on every screen size, unlike GXE and W–L: it is the
                    column that decides whether a row is worth clicking. */}
                <th className="text-end" title="Public replays in this format">
                  Replays
                </th>
                <th className="text-end d-none d-sm-table-cell">GXE</th>
                <th className="text-end d-none d-md-table-cell">W–L</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr
                  key={player.userid}
                  data-userid={player.userid}
                  onClick={() => openPlayer(player.userid)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="text-muted">{index + 1}</td>
                  <td className="text-truncate" style={{ maxWidth: '12rem' }}>
                    {player.username}
                  </td>
                  <td className="text-end">{Math.round(player.elo)}</td>
                  <td className="text-end text-nowrap">
                    <ReplayCount value={countFor(player.userid)} />
                  </td>
                  <td className="text-end d-none d-sm-table-cell">
                    {player.gxe}%
                  </td>
                  <td className="text-end d-none d-md-table-cell text-muted">
                    {player.w}–{player.l}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  )
}

export default LadderTable
