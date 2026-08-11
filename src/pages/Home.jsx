import { useState } from 'react'
import { Button, Col, Row } from 'react-bootstrap'

import SearchBar from '../components/SearchBar.jsx'
import LadderTable from '../components/LadderTable.jsx'
import ReplayList from '../components/ReplayList.jsx'
import { DEFAULT_FORMAT_ID, SUPPORTED_FORMATS, findFormat } from '../data/formats.js'
import { useLadder } from '../hooks/useLadder.js'
import { useTopPlayerReplays } from '../hooks/useTopPlayerReplays.js'

/**
 * Start page: pick a format to see its ladder, or search for a player directly.
 * Choosing a format reveals its dashboards in place rather than navigating, so
 * the search box stays available.
 */
function Home() {
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID)
  const format = findFormat(formatId)
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
              onClick={() => setFormatId(entry.id)}
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
