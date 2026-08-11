import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Col, Row } from 'react-bootstrap'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import AnalysisProgress from '../components/AnalysisProgress.jsx'
import FormatFilter from '../components/FormatFilter.jsx'
import GameCountPicker from '../components/GameCountPicker.jsx'
import RankedTable, { pct, winRateColumn } from '../components/RankedTable.jsx'
import RatingChart from '../components/RatingChart.jsx'
import ReplayShowcase from '../components/ReplayShowcase.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { DEFAULT_GAME_COUNT, largestUsableCount } from '../lib/gameCounts.js'
import StatTile from '../components/StatTile.jsx'
import { usePlayerAnalysis } from '../hooks/usePlayerAnalysis.js'
import { toUserId } from '../api/showdown.js'
import { findFormat } from '../data/formats.js'
import { displaySpecies } from '../lib/species.js'
import { timeAgo } from '../lib/time.js'

const countColumn = (header, pick, hideOn) => ({
  header,
  align: 'end',
  hideOn,
  cell: pick,
  // A count column only ever reads one way: "you beat Kingambit 13 times" is
  // the headline, "you beat Amoonguss twice" is not. Tables without `sortable`
  // ignore this.
  sortValue: pick,
  sortDir: 'desc',
})

/**
 * A player's dashboards.
 *
 * Headline tiles, the rating chart, the ranked breakdowns, and the replay
 * showcase. See docs/dashboards.md for what each widget means.
 */
function Player() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Kept in the URL so a format-scoped dashboard is shareable, and so arriving
  // from a ladder click lands on that ladder's format.
  const format = searchParams.get('format') || null

  const [gameCount, setGameCount] = useState(DEFAULT_GAME_COUNT)
  const { progress, data, error } = usePlayerAnalysis(userId, {
    limit: gameCount,
    format,
  })

  const changeFormat = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams)
      if (next) params.set('format', next)
      else params.delete('format')
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const busy = progress.phase !== 'done' && progress.phase !== 'idle' && progress.phase !== 'error'
  const stats = data?.stats
  const available = typeof data?.available === 'number' ? data.available : null

  // Arriving without ?format= (a plain search, rather than a ladder click) lets
  // the hook pick the player's most-played format. Read the scope back from the
  // data so the page always shows the format the numbers actually came from.
  const activeFormat = data?.format ?? format

  // The player may have zero replays in the selected format, in which case it
  // won't appear in formatCounts — fall back to our own label for supported
  // formats so the message can still name it.
  const formatLabel = activeFormat
    ? (data?.formatCounts?.find((entry) => entry.formatId === activeFormat)?.label ??
      findFormat(activeFormat)?.label ??
      activeFormat)
    : null

  // Their most-played format, offered as a way out when the selected one is
  // empty. Never offer the format we are already showing.
  const fallbackFormat =
    data?.formatCounts?.find((entry) => entry.formatId !== activeFormat) ?? null

  // Put the resolved format in the URL so the dashboard is shareable and a
  // refresh lands on the same scope. `replace` because this is completing the
  // address the user already asked for, not a new place to go back to.
  useEffect(() => {
    if (format || !data?.format) return
    changeFormat(data.format)
  }, [format, data?.format, changeFormat])

  // A team can only be identified when the replay has team preview. Random
  // Battle has none, so those battles contribute no team at all — say how many
  // were left out rather than showing a smaller sample without explanation.
  const excludedFromTeams = stats?.battlesWithoutTeamPreview ?? 0
  // "The full team" rather than "the six": most formats bring six, but not all
  // do — gen9randombattlesharedpowerb12p6 brings twelve.
  const teamSubtitle =
    excludedFromTeams > 0
      ? `The full team brought together, most-used first — ${excludedFromTeams} battle${
          excludedFromTeams === 1 ? '' : 's'
        } excluded for having no team preview`
      : 'The full team brought together, most-used first'

  // Once we know how many replays exist, step the selection down if it asked
  // for more than that — otherwise the button would read "200" while the page
  // showed a 30-game sample.
  useEffect(() => {
    if (available === null || gameCount <= available) return
    const best = largestUsableCount(available)
    if (best !== null) setGameCount(best)
  }, [available, gameCount])

  return (
    <>
      {/* Search stays on the page: looking up the next player shouldn't mean
          navigating back to the start page first. */}
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-1">
        <div className="d-flex flex-wrap align-items-baseline gap-2">
          <h1 className="h3 mb-0">{data?.displayName ?? userId}</h1>
          {data?.profile ? (
            <span className="text-muted small">
              registered {timeAgo(data.profile.registertime * 1000)}
            </span>
          ) : null}
        </div>
        <div style={{ minWidth: '16rem', maxWidth: '22rem', flexGrow: 1 }}>
          <SearchBar size="sm" showHint={false} />
        </div>
      </div>
      {/* State the scope explicitly — the whole point of the format filter is
          that the reader should never have to guess which games these are. */}
      <p className="text-muted mb-3">
        {stats && !busy && stats.totals.battles > 0 ? (
          <>
            {stats.totals.battles} battles · <strong>{formatLabel}</strong>
            {' · '}
          </>
        ) : null}
        <Link to="/">← back to formats</Link>
      </p>

      <Row className="g-3 mb-4 align-items-end">
        <Col md={5} lg={4}>
          <FormatFilter
            value={activeFormat}
            onChange={changeFormat}
            formatCounts={data?.formatCounts ?? []}
            total={data?.totalAvailable ?? 0}
            capped={Boolean(data?.totalCapped)}
            disabled={busy || !data}
            loading={busy || !data}
          />
        </Col>
        <Col md={7} lg={8}>
          <GameCountPicker
            value={gameCount}
            onChange={setGameCount}
            available={available}
            disabled={busy}
          />
        </Col>
      </Row>

      {busy ? (
        <div className="mb-4">
          <AnalysisProgress progress={progress} />
        </div>
      ) : null}

      {error ? (
        <Alert variant="danger">
          Analysis failed: {error.message}
        </Alert>
      ) : null}

      {stats && !busy ? (
        stats.totals.battles === 0 ? (
          activeFormat ? (
            // Being ranked on a ladder does not mean uploading replays from it.
            // Substituting other formats' data here is what made the page look
            // like it was inventing numbers, so say nothing rather than
            // something wrong.
            <Alert variant="warning">
              <strong>{data.displayName ?? userId}</strong> has no public replays
              in <strong>{formatLabel}</strong>
              {fallbackFormat ? (
                <>
                  , though they have {data.totalAvailable} in other formats.
                  Statistics from those would not describe this format, so
                  nothing is shown here.{' '}
                  <Alert.Link
                    as="button"
                    className="btn btn-link p-0 align-baseline border-0"
                    onClick={() => changeFormat(fallbackFormat.formatId)}
                  >
                    Show {fallbackFormat.label} instead
                  </Alert.Link>
                  .
                </>
              ) : (
                '.'
              )}
            </Alert>
          ) : (
            <Alert variant="warning">
              No public replays found for <strong>{userId}</strong>. This account
              exists, but its owner hasn&apos;t uploaded any replays — or they
              were all private.
            </Alert>
          )
        ) : (
          <>
            <Row className="g-3 mb-3">
              <Col xs={6} lg={3}>
                <StatTile
                  label="Battles analysed"
                  value={stats.totals.battles}
                  // Say plainly how big the pool was, so the sample size can't
                  // be mistaken for the number the user picked.
                  hint={
                    available !== null && available > stats.totals.battles
                      ? `of ${available} available`
                      : stats.lastBattle
                        ? `most recent ${timeAgo(stats.lastBattle)}`
                        : null
                  }
                />
              </Col>
              <Col xs={6} lg={3}>
                <StatTile
                  label="Win rate"
                  value={pct(stats.totals.winRate)}
                  hint={`${stats.totals.wins}W – ${stats.totals.losses}L${
                    stats.totals.ties ? ` – ${stats.totals.ties}T` : ''
                  }`}
                  variant={
                    stats.totals.winRate >= 0.55
                      ? 'success'
                      : stats.totals.winRate <= 0.45
                        ? 'danger'
                        : 'body'
                  }
                />
              </Col>
              <Col xs={6} lg={3}>
                <StatTile
                  label="Current streak"
                  value={
                    stats.streaks.current
                      ? `${stats.streaks.current}${stats.streaks.currentType === 'win' ? 'W' : 'L'}`
                      : '—'
                  }
                  hint={`best win streak ${stats.streaks.longestWin}`}
                  variant={stats.streaks.currentType === 'win' ? 'success' : 'danger'}
                />
              </Col>
              <Col xs={6} lg={3}>
                <StatTile
                  label="Avg battle length"
                  value={`${stats.turns.average.toFixed(0)}`}
                  hint={`turns · ${stats.knockouts.dealt} KOs dealt`}
                />
              </Col>
            </Row>

            {/* Be explicit about anything left out, rather than quietly
                reporting a smaller sample than the user asked for. */}
            {data.failed > 0 || data.skipped > 0 ? (
              <p className="text-muted small">
                {data.failed > 0 ? `${data.failed} replay(s) failed to download. ` : ''}
                {data.skipped > 0
                  ? `${data.skipped} replay(s) skipped (free-for-all battles aren't tracked).`
                  : ''}
              </p>
            ) : null}

            <Row className="g-3 mb-3">
              <Col xs={12}>
                <RatingChart points={stats.ratingTimeline} />
              </Col>
            </Row>

            {/* No "Formats" breakdown here any more: every battle on the page
                is in the format named above it, so the table was one row
                restating the filter. */}
            <Row className="g-3">
              {/* Full width: a row here is six Pokémon, not one name. */}
              <Col xs={12}>
                <RankedTable
                  title="Most Used Team"
                  subtitle={teamSubtitle}
                  rows={stats.teams}
                  nameHeader="Team"
                  wideName
                  renderName={(row) => (
                    <div className="d-flex flex-wrap gap-1">
                      {row.members.map((member) => (
                        <span
                          key={member}
                          className="badge text-bg-secondary fw-normal"
                        >
                          {displaySpecies(member)}
                        </span>
                      ))}
                    </div>
                  )}
                  columns={[
                    countColumn('Battles', (r) => r.battles),
                    winRateColumn(),
                  ]}
                  empty={
                    stats.battlesWithoutTeamPreview > 0
                      ? "This format has no team preview, so the replays don't say which six were brought."
                      : 'No teams to show yet.'
                  }
                />
              </Col>

              <Col lg={6}>
                <RankedTable
                  title="Most Common Wins"
                  subtitle="Opposing Pokémon you beat most often — click a column to rank by it"
                  rows={stats.commonWins}
                  nameHeader="Pokémon"
                  renderName={(row) => displaySpecies(row.key)}
                  sortable
                  columns={[
                    countColumn('Beat', (r) => r.wins),
                    countColumn('Faced', (r) => r.battles, 'd-none d-sm-table-cell'),
                    // Best matchups first: this table is about what you beat.
                    winRateColumn('Win rate', { sortDir: 'desc' }),
                  ]}
                  empty="No wins in this sample yet."
                />
              </Col>

              <Col lg={6}>
                <RankedTable
                  title="Most Common Loses"
                  subtitle="Opposing Pokémon that beat you most often — click a column to rank by it"
                  rows={stats.commonLoses}
                  nameHeader="Pokémon"
                  renderName={(row) => displaySpecies(row.key)}
                  sortable
                  columns={[
                    countColumn('Lost to', (r) => r.losses),
                    countColumn('Faced', (r) => r.battles, 'd-none d-sm-table-cell'),
                    // Worst matchups first. Highest-first here would top a table
                    // about losing with a 90% win rate — the reading that made
                    // this control confusing in the first place.
                    winRateColumn('Win rate', { sortDir: 'asc' }),
                  ]}
                  empty="No losses in this sample — nice."
                />
              </Col>

              <Col lg={6}>
                <RankedTable
                  title="Players who beat you more than once"
                  subtitle="Click a name to analyse them"
                  rows={stats.rivals}
                  nameHeader="Player"
                  // Keep the format scope when hopping to a rival — you're
                  // comparing them in the format you're both playing.
                  onRowClick={(row) =>
                    navigate(
                      `/player/${toUserId(row.key)}${
                        activeFormat
                          ? `?format=${encodeURIComponent(activeFormat)}`
                          : ''
                      }`,
                    )
                  }
                  columns={[
                    countColumn('They won', (r) => r.losses),
                    countColumn('You won', (r) => r.wins),
                  ]}
                  empty="Nobody has beaten you twice in this sample."
                />
              </Col>

              <Col lg={6}>
                <RankedTable
                  title="Most Used Tera"
                  subtitle="Tera types you chose"
                  rows={stats.teraTypes}
                  nameHeader="Tera type"
                  columns={[
                    countColumn('Times', (r) => r.battles),
                    winRateColumn(),
                  ]}
                  empty="No Terastallization in this sample. Older generations and some formats don't have it."
                />
              </Col>
            </Row>

            {/* Last, and full width: every widget above is an aggregate, so the
                way back to the individual games belongs at the bottom. */}
            <Row className="g-3 mt-0">
              <Col xs={12}>
                <ReplayShowcase battles={data.battles} />
              </Col>
            </Row>
          </>
        )
      ) : null}

      {!busy && !stats && !error ? (
        <Button variant="outline-secondary" disabled>
          Waiting to start…
        </Button>
      ) : null}
    </>
  )
}

export default Player
