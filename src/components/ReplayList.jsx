import { Alert, Badge, Card, Spinner, Table } from 'react-bootstrap'

import { timeAgo } from '../lib/time.js'

export function replayUrl(id) {
  return `https://replay.pokemonshowdown.com/${id}`
}

/**
 * Recent replays from the top of the ladder. Clicking one opens it on Pokémon
 * Showdown in a new tab — these are public pages, so a plain link is all it
 * takes (no API call, no CORS involved).
 */
function ReplayList({ formatLabel, replays, loading, error }) {
  function openReplay(event, id) {
    // The matchup cell is a real anchor so links can be copied or
    // middle-clicked; don't double-open when that anchor was the target.
    if (event.target.closest('a')) return
    window.open(replayUrl(id), '_blank', 'noopener,noreferrer')
  }

  return (
    <Card className="h-100 shadow-sm">
      <Card.Header className="fw-semibold">
        Recent replays — {formatLabel}
      </Card.Header>

      {loading ? (
        <Card.Body className="text-center text-muted py-5">
          <Spinner animation="border" size="sm" className="me-2" />
          Gathering replays from ranked players…
        </Card.Body>
      ) : error ? (
        <Card.Body>
          <Alert variant="danger" className="mb-0">
            Couldn&apos;t load replays. {error.message}
          </Alert>
        </Card.Body>
      ) : replays.length === 0 ? (
        <Card.Body className="text-muted">
          No recent public replays from ranked players in this format. Many top
          players never upload any.
        </Card.Body>
      ) : (
        <div style={{ maxHeight: '28rem', overflowY: 'auto' }}>
          <Table hover size="sm" className="mb-0 align-middle">
            <thead className="table-light position-sticky top-0">
              <tr>
                <th style={{ width: '3rem' }}>#</th>
                <th>Matchup</th>
                <th className="text-end d-none d-sm-table-cell">Rating</th>
                <th className="text-end">When</th>
              </tr>
            </thead>
            <tbody>
              {replays.map((replay) => {
                const [left, right] = replay.players ?? []
                return (
                  <tr
                    key={replay.id}
                    onClick={(event) => openReplay(event, replay.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <Badge bg="secondary" title={`${replay.rankedUsername} is ranked #${replay.rank}`}>
                        {replay.rank}
                      </Badge>
                    </td>
                    <td className="text-truncate" style={{ maxWidth: '16rem' }}>
                      <a
                        href={replayUrl(replay.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-decoration-none"
                      >
                        {left} vs {right}
                      </a>
                    </td>
                    <td className="text-end d-none d-sm-table-cell">
                      {replay.rating ?? '—'}
                    </td>
                    <td className="text-end text-muted text-nowrap">
                      {timeAgo(replay.uploadtime * 1000)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  )
}

export default ReplayList
