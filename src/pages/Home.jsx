import { useCallback, useEffect } from 'react'
import { Button, Col, Row } from 'react-bootstrap'
import { useSearchParams } from 'react-router-dom'

import SearchBar from '../components/SearchBar.jsx'
import LadderTable from '../components/LadderTable.jsx'
import ReplayList from '../components/ReplayList.jsx'
import { DEFAULT_FORMAT_ID, SUPPORTED_FORMATS, findFormat } from '../data/formats.js'
import { useLadder } from '../hooks/useLadder.js'
import { useTopPlayerReplays } from '../hooks/useTopPlayerReplays.js'
import { useStoredState } from '../hooks/useStoredState.js'
import { useTrendingFormats } from '../hooks/useTrendingFormats.js'

/**
 * Start page: pick a format to see its ladder, or search for a player directly.
 * Choosing a format reveals its dashboards in place rather than navigating, so
 * the search box stays available.
 */
function Home() {
  const [searchParams, setSearchParams] = useSearchParams()

  // The selected format used to be plain component state, which this page loses
  // the moment you open a player — Home unmounts. Coming back always landed on
  // Gen 9 OU no matter what you had been browsing.
  //
  // Two places remember it, because there are two ways back:
  //  - the URL, for the "← back to formats" link, the browser's back button, and
  //    a shared link. Same reasoning as the player page's ?format=.
  //  - localStorage, for arrivals with no format in the URL at all — the navbar
  //    brand, a bookmark, a new session.
  const [lastFormatId, setLastFormatId] = useStoredState(
    'homeFormat',
    DEFAULT_FORMAT_ID,
    (value) => Boolean(findFormat(value)),
  )

  const trending = useTrendingFormats()
  const findShown = (id) =>
    findFormat(id) ?? trending.formats.find((entry) => entry.id === id) ?? null

  // URL wins when it names a format this page offers — fixed or trending. An
  // unrecognised ?format= falls back rather than rendering a page with no
  // dashboards — remember that a bad formatid doesn't 404, it returns an empty
  // toplist.
  //
  // While the trending sample is still loading we can't yet tell "trending"
  // from "unknown", so wait instead of falling back: otherwise a back-link to a
  // trending format would load the remembered format's ladder for nothing and
  // then jump.
  //
  // Only fixed formats are remembered in storage (the validator is findFormat).
  // Trends change; a new session shouldn't open on last week's.
  const urlFormatId = searchParams.get('format')
  const urlFormat = findShown(urlFormatId)
  const waitingForTrending = Boolean(urlFormatId) && !urlFormat && trending.loading
  const format = urlFormat ?? (waitingForTrending ? null : findFormat(lastFormatId))
  const formatId = format?.id ?? null

  const changeFormat = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams)
      params.set('format', next)
      // `replace`: picking a format changes what this page shows, it isn't
      // travelling somewhere new. Otherwise clicking through the six buttons
      // would need six presses of Back to leave the start page.
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  // Mirror the URL into storage rather than writing it in changeFormat, so
  // "the last format" means the last one actually shown — however you got to
  // it: a button, the back link from a player, the browser's back button, or a
  // shared link. One place decides, instead of every caller remembering to.
  useEffect(() => {
    if (findFormat(urlFormatId) && urlFormatId !== lastFormatId) {
      setLastFormatId(urlFormatId)
    }
  }, [urlFormatId, lastFormatId, setLastFormatId])

  const { players, loading, error } = useLadder(formatId)
  // Reuses the ladder we already have rather than fetching it again.
  const {
    replays,
    loading: replaysLoading,
    error: replaysError,
  } = useTopPlayerReplays(formatId, players)

  return (
    <>
      <div className="mb-4">
        <h1 className="h3">Trackinch Stats</h1>
        <p className="text-muted mb-0">
          Pick a format to browse its ladder, or look up any player&apos;s
          replay history.
        </p>
      </div>

      <div className="mb-4">
        <div className="text-uppercase text-muted small fw-semibold mb-2">
          Formats
        </div>
        <div className="d-flex flex-wrap gap-2">
          {SUPPORTED_FORMATS.map((entry) => (
            <Button
              key={entry.id}
              variant={entry.id === formatId ? 'primary' : 'outline-primary'}
              // No toggling off: a format is always selected, so clicking the
              // active one again is a no-op rather than emptying the page.
              onClick={() => changeFormat(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Hidden while empty rather than showing an empty heading: a failed or
          quiet sample just means the fixed list above is all there is. */}
      {trending.formats.length > 0 ? (
        <div className="mb-4">
          <div className="text-uppercase text-muted small fw-semibold mb-2">
            Trending now
          </div>
          <div className="d-flex flex-wrap gap-2">
            {trending.formats.map((entry) => (
              <Button
                key={entry.id}
                variant={entry.id === formatId ? 'secondary' : 'outline-secondary'}
                onClick={() => changeFormat(entry.id)}
                title={`${entry.count} of the most recent public replays`}
              >
                {entry.label}
              </Button>
            ))}
          </div>
          <div className="text-muted small mt-1">
            Most played on Showdown
            {trending.windowMinutes > 0
              ? ` in the last ${trending.windowMinutes} minutes`
              : ' right now'}
            , beyond the formats above.
          </div>
        </div>
      ) : null}

      <Row className="mb-4">
        <Col lg={7} xl={6}>
          <SearchBar autoFocus />
        </Col>
      </Row>

      {format ? (
        <Row className="g-3">
          <Col lg={6}>
            <LadderTable
              formatId={format.id}
              formatLabel={format.label}
              players={players}
              loading={loading}
              error={error}
            />
          </Col>
          <Col lg={6}>
            <ReplayList
              formatLabel={format.label}
              replays={replays}
              // The ladder must land before replays can even start.
              loading={loading || replaysLoading}
              error={replaysError}
            />
          </Col>
        </Row>
      ) : null}
    </>
  )
}

export default Home
