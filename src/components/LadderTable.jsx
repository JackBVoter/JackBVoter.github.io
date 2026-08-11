import { Alert, Card, Spinner, Table } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'

/**
 * The top 100 players on a format's ladder, scrollable.
 * Clicking a row opens that player's dashboards — the same destination as
 * typing their name into the search box.
 */
function LadderTable({ formatId, formatLabel, players, loading, error }) {
  const navigate = useNavigate()

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
        <div style={{ maxHeight: '28rem', overflowY: 'auto' }}>
          <Table hover size="sm" className="mb-0 align-middle">
            <thead className="table-light position-sticky top-0">
              <tr>
                <th style={{ width: '3rem' }}>#</th>
                <th>Player</th>
                <th className="text-end">Elo</th>
                <th className="text-end d-none d-sm-table-cell">GXE</th>
                <th className="text-end d-none d-md-table-cell">W–L</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, index) => (
                <tr
                  key={player.userid}
                  onClick={() => openPlayer(player.userid)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="text-muted">{index + 1}</td>
                  <td className="text-truncate" style={{ maxWidth: '12rem' }}>
                    {player.username}
                  </td>
                  <td className="text-end">{Math.round(player.elo)}</td>
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
