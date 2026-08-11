import { useMemo, useState } from 'react'
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

/**
 * A win-rate cell with small-sample handling, shared by most widgets.
 *
 * `sortDir` has no default worth guessing: on "Most Common Wins" the
 * interesting end is your best matchups, on "Most Common Loses" it's your
 * worst. Each caller states which way its table means.
 */
export function winRateColumn(header = 'Win rate', { sortDir = 'desc' } = {}) {
  return {
    header,
    align: 'end',
    className: rateClass,
    cell: (row) => (row.decided > 0 ? pct(row.winRate) : '—'),
    sortValue: (row) => row.winRate,
    sortDir,
    // Rows with no decided battles show "—", not a percentage. Their winRate is
    // 0 by convention rather than by result, so they belong at the bottom
    // whichever way the column runs.
    sortRank: (row) => (row.decided > 0 ? 1 : 0),
  }
}

/**
 * "Top N by some measure" table, shared by every ranked widget on the player
 * page. Columns are configurable because each widget counts something
 * different — battles, wins, losses, times used.
 *
 * When `sortable`, the reader chooses which column ranks the table, but NOT
 * which direction it runs. Direction is a property of the measure, not a
 * preference: "Lost to" is only ever interesting highest-first, and win rate on
 * a loses table is only ever interesting lowest-first. Letting it flip produced
 * the reading that broke this widget — a 90% win rate sitting at the top of a
 * table about losing, which looks like a bug rather than a definition. So each
 * column declares its one correct `sortDir` and clicking only ever picks the
 * column.
 *
 * @param {object[]} rows - pre-sorted; used as-is when not sortable
 * @param {object[]} columns - { header, cell(row), align?, className?, hideOn?,
 *   sortValue?(row), sortDir?: 'desc'|'asc', sortRank?(row) }
 * @param {boolean} sortable - opt-in: some widgets are a deliberate ranking
 *   where re-ordering would undercut the point of the widget.
 */
function RankedTable({
  title,
  subtitle,
  rows,
  columns,
  nameHeader = 'Name',
  renderName = (row) => row.key,
  onRowClick,
  sortable = false,
  // Some rows aren't a name but a composition — six Pokémon that need room to
  // wrap. Truncating those to one line would hide most of the row's content.
  wideName = false,
  // Not every table is a ranking. Turn-length bands are an ordered series, and
  // numbering them 1..4 would imply "1 is the best" when it only means
  // "shortest".
  showRank = true,
  max = 10,
  empty = 'Nothing to show yet.',
}) {
  const sortableColumns = sortable ? columns.filter((c) => c.sortValue) : []

  // Start on the first sortable column, which each caller orders its rows by
  // anyway — so the initial view matches what the widget's title promises, and
  // the active column is visibly marked from the first render rather than
  // appearing only after a click.
  const [sortHeader, setSortHeader] = useState(sortableColumns[0]?.header ?? null)

  const sortColumn = sortableColumns.find((c) => c.header === sortHeader) ?? null

  // Sort the whole list, never just the visible slice: with `max` rows shown,
  // re-ranking only those would reorder an arbitrary top-10 rather than
  // answering "who actually leads by this measure".
  const ordered = useMemo(() => {
    if (!sortColumn) return rows
    const dir = sortColumn.sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const rank = (sortColumn.sortRank?.(b) ?? 0) - (sortColumn.sortRank?.(a) ?? 0)
      if (rank) return rank
      const diff = (sortColumn.sortValue(a) - sortColumn.sortValue(b)) * dir
      if (diff) return diff
      // Tie-break on sample size so a lone 100% doesn't outrank a
      // well-evidenced one, then on name to keep the order stable.
      return (
        (b.decided ?? b.battles ?? 0) - (a.decided ?? a.battles ?? 0) ||
        String(a.key).localeCompare(String(b.key))
      )
    })
  }, [rows, sortColumn])

  const shown = ordered.slice(0, max)

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
                {showRank ? (
                  <th style={{ width: '2.5rem' }} className="text-muted fw-normal">
                    #
                  </th>
                ) : null}
                <th className="text-muted fw-normal">{nameHeader}</th>
                {columns.map((column) => {
                  const canSort = sortableColumns.includes(column)
                  const active = sortColumn === column
                  const lowestFirst = column.sortDir === 'asc'
                  return (
                    <th
                      key={column.header}
                      className={`text-muted fw-normal text-${column.align ?? 'end'} ${
                        column.hideOn ?? ''
                      }`}
                      aria-sort={
                        active ? (lowestFirst ? 'ascending' : 'descending') : undefined
                      }
                    >
                      {canSort ? (
                        // A button rather than a clickable th, so the sort is
                        // reachable by keyboard and announced as a control.
                        // Clicking the active column is a no-op — there is no
                        // second state to toggle into.
                        <button
                          type="button"
                          className={`btn btn-link btn-sm p-0 text-decoration-none align-baseline ${
                            active ? 'fw-semibold' : 'text-muted'
                          }`}
                          onClick={() => setSortHeader(column.header)}
                          aria-pressed={active}
                          title={`Sort by ${column.header.toLowerCase()} — ${
                            lowestFirst ? 'lowest first' : 'highest first'
                          }`}
                        >
                          {column.header}
                          {/* Only on the active column, and it reports the
                              column's fixed direction rather than offering a
                              flip. */}
                          {active ? (
                            <span aria-hidden="true">{lowestFirst ? ' ↑' : ' ↓'}</span>
                          ) : null}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr
                  key={row.key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {showRank ? <td className="text-muted">{index + 1}</td> : null}
                  <td
                    className={wideName ? 'w-100' : 'text-truncate'}
                    style={wideName ? undefined : { maxWidth: '11rem' }}
                  >
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
