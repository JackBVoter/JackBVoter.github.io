import { Card, Table } from 'react-bootstrap'

export function pct(n) {
  return `${Math.round(n * 100)}%`
}

// A win rate over one or two battles is noise, not a signal. Colour only when
// there's enough behind it to mean something, so the page doesn't shout
// "100%" at a single lucky game.
const MIN_SAMPLE_TO_COLOUR = 3

export function rateClass(row) {
  if (row.decided < MIN_SAMPLE_TO_COLOUR) return 'text-muted'
  if (row.winRate >= 0.6) return 'text-success fw-semibold'
  if (row.winRate <= 0.4) return 'text-danger fw-semibold'
  return ''
}

/** A win-rate cell with small-sample handling, shared by most widgets. */
export function winRateColumn(header = 'Win rate') {
  return {
    header,
    align: 'end',
    className: rateClass,
    cell: (row) => (row.decided > 0 ? pct(row.winRate) : '—'),
  }
}

/**
 * "Top N by some measure" table, shared by every ranked widget on the player
 * page. Columns are configurable because each widget counts something
 * different — battles, wins, losses, times used.
 *
 * @param {object[]} rows - pre-sorted; this component does not reorder
 * @param {object[]} columns - { header, cell(row), align?, className?, hideOn? }
 */
function RankedTable({
  title,
  subtitle,
  rows,
  columns,
  nameHeader = 'Name',
  renderName = (row) => row.key,
  onRowClick,
  max = 10,
  empty = 'Nothing to show yet.',
}) {
  const shown = rows.slice(0, max)

  return (
    <Card className="h-100 shadow-sm">
      <Card.Body className="pb-2">
        <Card.Title className="h6 mb-1">{title}</Card.Title>
        {subtitle ? <div className="text-muted small mb-2">{subtitle}</div> : null}

        {shown.length === 0 ? (
          <p className="text-muted small mb-2">{empty}</p>
        ) : (
          <Table size="sm" hover responsive className="mb-1 align-middle">
            <thead>
              <tr>
                <th style={{ width: '2.5rem' }} className="text-muted fw-normal">
                  #
                </th>
                <th className="text-muted fw-normal">{nameHeader}</th>
                {columns.map((column) => (
                  <th
                    key={column.header}
                    className={`text-muted fw-normal text-${column.align ?? 'end'} ${
                      column.hideOn ?? ''
                    }`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr
                  key={row.key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  <td className="text-muted">{index + 1}</td>
                  <td className="text-truncate" style={{ maxWidth: '11rem' }}>
                    {renderName(row)}
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.header}
                      className={`text-${column.align ?? 'end'} ${
                        column.hideOn ?? ''
                      } ${
                        typeof column.className === 'function'
                          ? column.className(row)
                          : (column.className ?? '')
                      }`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {rows.length > max ? (
          <div className="text-muted small">
            Showing top {max} of {rows.length}.
          </div>
        ) : null}
      </Card.Body>
    </Card>
  )
}

export default RankedTable
