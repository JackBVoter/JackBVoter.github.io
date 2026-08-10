import { useEffect, useState } from 'react'
import { Alert, Button, Col, Row } from 'react-bootstrap'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import AnalysisProgress from '../components/AnalysisProgress.jsx'
import FormatFilter from '../components/FormatFilter.jsx'
import GameCountPicker from '../components/GameCountPicker.jsx'
import RankedTable, { pct, winRateColumn } from '../components/RankedTable.jsx'
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
})

/**
 * A player's dashboards.
 *
 * Headline tiles plus the ranked breakdowns. Still to come: ladder rank over
 * time (needs a chart) and the replay showcase. See docs/dashboards.md.
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

  function changeFormat(next) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('format', next)
    else params.delete('format')
    setSearchParams(params, { replace: true })
  }

  const busy = progress.phase !== 'done' && progress.phase !== 'idle' && progress.phase !== 'error'
  const stats = data?.stats
  const available = typeof data?.available === 'number' ? data.available : null

  // The player may have zero replays in the selected format, in which case it
  // won't appear in formatCounts — fall back to our own label for supported
  // formats so the message can still name it.
  const formatLabel = format
    ? (data?.formatCounts?.find((entry) => entry.formatId === format)?.label ??
      findFormat(format)?.label ??
      format)
    : 'All formats'

  // Random Battle logs carry no team preview, so team composition there is only
  // what was actually sent out. Say so rather than presenting a partial team as
  // if it were the whole one.
  const noTeamPreview = Boolean(
    stats?.formats.some((format) => /random battle/i.test(format.key)),
  )

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
            value={format}
            onChange={changeFormat}
            formatCounts={data?.formatCounts ?? []}
            total={data?.totalAvailable ?? 0}
            capped={Boolean(data?.totalCapped)}
            disabled={busy || !data}
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
          format ? (
            // Being ranked on a ladder does not mean uploading replays from it.
            // Substituting other formats' data here is what made the page look
            // like it was inventing numbers, so say nothing rather than
            // something wrong.
            <Alert variant="warning">
              <strong>{data.displayName ?? userId}</strong> has no public replays
              in <strong>{formatLabel}</strong>
              {data.totalAvailable > 0 ? (
                <>
                  , though they have {data.totalAvailable} in other formats.
                  Statistics from those would not describe this format, so
                  nothing is shown here.{' '}
                  <Alert.Link
                    as="button"
                    className="btn btn-link p-0 align-baseline border-0"
                    onClick={() => changeFormat(null)}
                  >
                    Show all formats instead
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

            <Row className="g-3">
              <Col lg={6}>
                <RankedTable
                  title="Formats"
                  subtitle="Where these battles were played"
                  rows={stats.formats}
                  nameHeader="Format"
                  columns={[
                    countColumn('Battles', (r) => r.battles),
                    winRateColumn(),
                  ]}
                />
              </Col>

              <Col lg={6}>
                <RankedTable
                  title="Most Used Team"
                  subtitle={
                    noTeamPreview
                      ? 'Pokémon brought most often — Random Battle has no team preview, so only revealed Pokémon are counted there'
                      : 'Pokémon brought most often'
                  }
                  rows={stats.team}
                  nameHeader="Pokémon"
                  renderName={(row) => displaySpecies(row.key)}
                  columns={[
                    countColumn('Battles', (r) => r.battles),
                    winRateColumn(),
                  ]}
                />
              </Col>

              <Col lg={6}>
                <RankedTable
                  title="Most Common Wins"
                  subtitle="Opposing Pokémon you beat most often"
                  rows={stats.commonWins}
                  nameHeader="Pokémon"
                  renderName={(row) => displaySpecies(row.key)}
                  columns={[
                    countColumn('Beat', (r) => r.wins),
                    countColumn('Faced', (r) => r.battles, 'd-none d-sm-table-cell'),
                    winRateColumn(),
                  ]}
                  empty="No wins in this sample yet."
                />
              </Col>

              <Col lg={6}>
                <RankedTable
                  title="Most Common Loses"
                  subtitle="Opposing Pokémon that beat you most often"
                  rows={stats.commonLoses}
                  nameHeader="Pokémon"
                  renderName={(row) => displaySpecies(row.key)}
                  columns={[
                    countColumn('Lost to', (r) => r.losses),
                    countColumn('Faced', (r) => r.battles, 'd-none d-sm-table-cell'),
                    winRateColumn(),
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
                        format ? `?format=${encodeURIComponent(format)}` : ''
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
