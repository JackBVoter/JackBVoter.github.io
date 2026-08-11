import { Badge, Card, Table } from 'react-bootstrap'

import { replayUrl } from './ReplayList.jsx'
import { timeAgo } from '../lib/time.js'

/**
 * "Replay Showcase" — the individual battles behind the statistics.
 *
 * Every widget on this page is an aggregate; this is the way back to the source.
 * Clicking a row opens that battle on Pokémon Showdown in a new tab. Those are
 * public pages, so a plain anchor is all it takes — navigation, not a fetch, so
 * CORS never enters into it (the design question the Figma file left open).
 *
 * Sibling of ReplayList, which shows *other* people's replays on the start page.
 * Different data (parsed battles, so we know the result and turn count) and a
 * different job, so it's a separate component rather than a prop on that one.
 *
 * @param {object[]} battles - parseReplay output, newest first
 */
function ReplayShowcase({ battles = [] }) {
  function openReplay(event, id) {
    // The opponent cell is a real anchor so the link can be copied or
    // middle-clicked; don't open twice when that anchor was the target.
    if (event.target.closest('a')) return
    window.open(replayUrl(id), '_blank', 'noopener,noreferrer')
  }

  return (
    <Card className="h-100 shadow-sm">
      <Card.Body className="pb-2">
        <Card.Title className="h6 mb-1">Replay Showcase</Card.Title>
        <div className="text-muted small mb-2">
          The battles behind these numbers, newest first — click one to watch it
          on Pokémon Showdown
        </div>
      </Card.Body>

      {battles.length === 0 ? (
        <Card.Body className="pt-0 text-muted small">
          No replays in this sample.
        </Card.Body>
      ) : (
        // Capped height rather than a "show more" button: the sample can be 200
        // battles, and scrolling beats burying the widgets below it.
        //
        // Inset with its own border: as a direct child of the Card this would
        // otherwise run edge to edge, and its square corners would sit outside
        // the card's rounded ones. `overflow-y: auto` is enough to clip to the
        // radius — the .overflow-hidden utility can't be used here because it
        // is !important and would kill the scrolling.
        <div
          className="mx-3 mb-3 border rounded data-well"
          style={{ maxHeight: '28rem', overflowY: 'auto' }}
        >
          <Table hover size="sm" className="mb-0 align-middle">
            <thead className="table-light position-sticky top-0">
              <tr>
                <th style={{ width: '3.5rem' }}>Result</th>
                <th>Opponent</th>
                <th className="text-end d-none d-sm-table-cell">Turns</th>
                <th className="text-end d-none d-md-table-cell">Elo</th>
                <th className="text-end">When</th>
              </tr>
            </thead>
            <tbody>
              {battles.map((battle) => (
                <tr
                  key={battle.id}
                  onClick={(event) => openReplay(event, battle.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <Badge
                      bg={
                        battle.result === 'win'
                          ? 'success'
                          : battle.result === 'loss'
                            ? 'danger'
                            : 'secondary'
                      }
                    >
                      {battle.result === 'win'
                        ? 'W'
                        : battle.result === 'loss'
                          ? 'L'
                          : battle.result === 'tie'
                            ? 'T'
                            : '?'}
                    </Badge>
                  </td>
                  <td className="text-truncate" style={{ maxWidth: '14rem' }}>
                    <a
                      href={replayUrl(battle.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-decoration-none"
                    >
                      {battle.opponent.name || 'Unknown opponent'}
                    </a>
                    {/* A forfeit explains a short battle that would otherwise
                        look like a parsing error — but say who gave up. "Forfeit"
                        alone, sitting next to the opponent's name, reads as
                        though they did, and at high ladder it is just as often
                        the player. */}
                    {battle.me.forfeited ? (
                      <span className="text-muted small ms-2">you forfeited</span>
                    ) : battle.opponent.forfeited ? (
                      <span className="text-muted small ms-2">they forfeited</span>
                    ) : null}
                  </td>
                  <td className="text-end d-none d-sm-table-cell text-muted">
                    {battle.turns || '—'}
                  </td>
                  <td className="text-end d-none d-md-table-cell text-muted">
                    {battle.me.elo ?? '—'}
                  </td>
                  <td className="text-end text-muted text-nowrap">
                    {timeAgo(battle.uploadTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {battles.length > 0 ? (
        <Card.Body className="pt-2 pb-3 text-muted small">
          Showing all {battles.length} analyzed{' '}
          {battles.length === 1 ? 'battle' : 'battles'}. Raise the game count
          above to include more.
        </Card.Body>
      ) : null}
    </Card>
  )
}

export default ReplayShowcase
