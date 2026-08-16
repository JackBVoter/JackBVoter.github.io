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

  // URL wins when it names a format we actually support. An unrecognised
  // ?format= falls back rather than rendering a page with no dashboards —
  // remember that a bad formatid doesn't 404, it returns an empty toplist.
  const urlFormatId = searchParams.get('format')
  const formatId = findFormat(urlFormatId) ? urlFormatId : lastFormatId
  const format = findFormat(formatId)

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
