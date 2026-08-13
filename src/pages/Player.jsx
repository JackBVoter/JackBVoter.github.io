import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Col, Form, Row } from 'react-bootstrap'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import AnalysisProgress from '../components/AnalysisProgress.jsx'
import FormatFilter from '../components/FormatFilter.jsx'
import GameCountPicker from '../components/GameCountPicker.jsx'
import RankedTable, { pct, winRateColumn } from '../components/RankedTable.jsx'
import RatingChart from '../components/RatingChart.jsx'
import ReplayShowcase from '../components/ReplayShowcase.jsx'
import SearchBar from '../components/SearchBar.jsx'
import { DEFAULT_GAME_COUNT } from '../lib/gameCounts.js'
import StatTile from '../components/StatTile.jsx'
import TypeLabel from '../components/TypeLabel.jsx'
import { usePlayerAnalysis } from '../hooks/usePlayerAnalysis.js'
import { toUserId } from '../api/showdown.js'
import { findFormat } from '../data/formats.js'
import { aggregate, teamKeyOf } from '../lib/aggregate.js'
import { displaySpecies } from '../lib/species.js'
import { timeAgo } from '../lib/time.js'

/** The six (or however many) a team is, as badges. */
function TeamBadges({ members }) {
  return (
    <div className="d-flex flex-wrap gap-1">
      {members.map((member) => (
        <span key={member} className="badge text-bg-secondary fw-normal">
          {displaySpecies(member)}
        </span>
      ))}
    </div>
  )
}

const countColumn = (header, pick, hideOn, width) => ({
  header,
  align: 'end',
  hideOn,
  width,
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
  // Default on, so the page opens showing everything a player uploaded and the
  // toggle is an opt-in narrowing rather than a hidden filter.
  const [includeUnrated, setIncludeUnrated] = useState(true)
  const { progress, data, error } = usePlayerAnalysis(userId, {
    limit: gameCount,
    format,
    includeUnrated,
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

  // "Most Used Team" doubles as a filter: pick a team and every widget below
  // re-reads from just those games. One team at a time — the question it
  // answers is "how does this team do?", and two teams at once is only the
  // unfiltered page with extra steps.
  const [teamKey, setTeamKey] = useState(null)

  const busy = progress.phase !== 'done' && progress.phase !== 'idle' && progress.phase !== 'error'
  // Everything the analysis found, before the team filter. The team widget is
  // the filter's own control, so it always lists every team — narrowing it to
  // the selected row would take away the way back out.
  const fullStats = data?.stats
  const available = typeof data?.available === 'number' ? data.available : null

  // A stale key (the team is gone after a format change, a smaller sample, or
  // hiding unrated games) simply reads as no filter rather than an empty page.
  const selectedTeam = fullStats?.teams.find((team) => team.key === teamKey) ?? null

  // No re-fetch: the replays are already downloaded and parsed, so scoping to a
  // team is a re-count over a subset. Cheap enough to do synchronously.
  const battles = useMemo(
    () =>
      selectedTeam
        ? (data?.battles ?? []).filter((b) => teamKeyOf(b) === selectedTeam.key)
        : (data?.battles ?? []),
    [data?.battles, selectedTeam],
  )
  const stats = useMemo(
    () => (selectedTeam ? aggregate(battles) : fullStats),
    [selectedTeam, battles, fullStats],
  )

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

  // The bands themselves say "5 turns or fewer", so they don't need a caption
  // naming the format style on top — that read as jargon. Say what the widget
  // is for instead.
  const excludedFromLength = stats?.battlesWithoutTurns ?? 0
  const lengthSubtitle = `How game length affects winrate${
    excludedFromLength > 0
      ? ` — ${excludedFromLength} battle${
          excludedFromLength === 1 ? '' : 's'
        } with no recorded turns excluded`
      : ''
  }`

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

  // Teams don't survive a change of format — different legal Pokémon, so the
  // selected six can't exist in the new one. Deliberately NOT reset when the
  // game count or the unrated toggle changes: there the user is adjusting the
  // sample for the team they're already looking at.
  useEffect(() => {
    setTeamKey(null)
  }, [activeFormat])

  // A team can only be identified when the replay has team preview. Random
  // Battle has none, so those battles contribute no team at all — say how many
  // were left out rather than showing a smaller sample without explanation.
  const excludedFromTeams = fullStats?.battlesWithoutTeamPreview ?? 0
  // "The full team" rather than "the six": most formats bring six, but not all
  // do — gen9randombattlesharedpowerb12p6 brings twelve.
  const teamSubtitle = `The full team brought together, most-used first — pick one to scope the whole page to it, click it again to clear${
    excludedFromTeams > 0
      ? ` · ${excludedFromTeams} battle${
          excludedFromTeams === 1 ? '' : 's'
        } excluded for having no team preview`
      : ''
  }`

  // The selection is deliberately NOT stepped down to fit what exists. It used
  // to be, so that the button could never read "200" over a 30-game sample —
  // but that also meant a player with 58 replays was pinned to 50 and could not
  // reach the other 8. The picker states the shortfall instead, and the hook
  // caps the fetch at what is actually there.

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
        <Col xs={12}>
          {/* Ladder games versus direct challenges. Whether a battle was rated
              lives in the log, not the replay listing, so this filters after
              downloading — the sample shrinks rather than reaching for
              replacements, and the count below says by how much. */}
          <Form.Check
            type="switch"
            id="include-unrated"
            checked={includeUnrated}
            disabled={busy}
            onChange={(event) => setIncludeUnrated(event.target.checked)}
            label={
              <>
                Include unrated games
                <span className="text-muted small ms-2">
                  {includeUnrated
                    ? 'ladder matches and direct challenges'
                    : `ladder matches only${
                        data?.unratedExcluded
                          ? ` — ${data.unratedExcluded} excluded`
                          : ''
                      }`}
                </span>
              </>
            }
          />
        </Col>
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

      {/* The team filter changes every number below it, so it gets said at the
          top next to the other scope controls — not left implicit in a checked
          radio further down the page. */}
      {selectedTeam && !busy ? (
        <Alert
          variant="secondary"
          className="py-2 d-flex flex-wrap align-items-center gap-2"
        >
          <span className="small">
            Showing only the {selectedTeam.battles}{' '}
            {selectedTeam.battles === 1 ? 'game' : 'games'} with this team:
          </span>
          <TeamBadges members={selectedTeam.members} />
          <Button
            size="sm"
            variant="outline-secondary"
            className="ms-auto"
            onClick={() => setTeamKey(null)}
          >
            Show all teams
          </Button>
        </Alert>
      ) : null}

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
          // The filter emptied the sample. Saying "no replays in this format"
          // here would be a lie — they have some, we just dropped them all.
          data.unratedExcluded > 0 ? (
            <Alert variant="warning">
              All {data.unratedExcluded}{' '}
              {data.unratedExcluded === 1 ? 'replay' : 'replays'} found for{' '}
              <strong>{data.displayName ?? userId}</strong> in{' '}
              <strong>{formatLabel}</strong>{' '}
              {data.unratedExcluded === 1 ? 'was' : 'were'} unrated, so there is
              nothing left to show.{' '}
              <Alert.Link
                as="button"
                className="btn btn-link p-0 align-baseline border-0"
                onClick={() => setIncludeUnrated(true)}
              >
                Include unrated games
              </Alert.Link>
              .
            </Alert>
          ) : activeFormat ? (
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
                  label="Battles analyzed"
                  value={stats.totals.battles}
                  // Say plainly how big the pool was, so the sample size can't
                  // be mistaken for the number the user picked.
                  hint={
                    // With a team selected, "of 200 available" would compare a
                    // team's games against every replay in the format. Compare
                    // against the sample it was filtered out of instead.
                    selectedTeam
                      ? `of ${fullStats.totals.battles} in this format`
                      : available !== null && available > stats.totals.battles
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
                  // Always the unfiltered list: this table is the filter's
                  // control, so it has to keep offering the other teams.
                  rows={fullStats.teams}
                  nameHeader="Team"
                  wideName
                  // Six badges still need most of the row, but not all of it —
                  // `w-100` was crushing the other three columns together
                  // against the right edge.
                  nameWidth="50%"
                  rowClass={(row) =>
                    row.key === selectedTeam?.key ? 'table-active' : undefined
                  }
                  renderName={(row) => <TeamBadges members={row.members} />}
                  columns={[
                    countColumn('Battles', (r) => r.battles, undefined, '12%'),
                    { ...winRateColumn(), width: '14%' },
                    {
                      header: 'Filter by team',
                      align: 'center',
                      width: '16%',
                      // Radios rather than checkboxes: one team at a time is
                      // the rule, and a radio group is the control that says so
                      // without having to be told.
                      //
                      // Clicking the selected one clears it. A radio can't
                      // normally unset itself, so this is handled explicitly:
                      // a click on an already-checked radio fires `click` but
                      // NOT `change`, so the two handlers never both act. (The
                      // pair is also order-independent — if a browser did fire
                      // both, the result is still "cleared".)
                      cell: (row) => {
                        const isSelected = row.key === selectedTeam?.key
                        return (
                          <Form.Check
                            type="radio"
                            name="team-filter"
                            className="d-inline-block"
                            id={`team-filter-${row.key}`}
                            checked={isSelected}
                            onChange={() => setTeamKey(row.key)}
                            onClick={() => {
                              if (isSelected) setTeamKey(null)
                            }}
                            aria-label={`Show only games with ${row.members
                              .map(displaySpecies)
                              .join(', ')}`}
                            title={
                              isSelected
                                ? 'Clear the filter and show all teams again'
                                : 'Show the whole page for just this team'
                            }
                          />
                        )
                      },
                    },
                  ]}
                  empty={
                    fullStats.battlesWithoutTeamPreview > 0
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
                  subtitle="Click a name to analyze them"
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

              {/* Only when we know the style: the bands differ between
                  singles and doubles, so with an unreadable sample there is no
                  honest set of thresholds to use. */}
              {stats.battleStyle ? (
                <Col lg={6}>
                  <RankedTable
                    title="Win Rate by Game Length"
                    subtitle={lengthSubtitle}
                    rows={stats.lengthBands}
                    nameHeader="Game length"
                    // An ordered series, shortest to longest — not a ranking,
                    // so no position numbers and no re-sorting.
                    showRank={false}
                    columns={[
                      countColumn('Battles', (r) => r.battles),
                      winRateColumn(),
                    ]}
                  />
                </Col>
              ) : null}

              <Col lg={6}>
                <RankedTable
                  title="Most Used Tera"
                  subtitle="Tera types you chose"
                  rows={stats.teraTypes}
                  nameHeader="Tera type"
                  renderName={(row) => <TypeLabel type={row.key} />}
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
                <ReplayShowcase battles={battles} />
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
