import { Card, ProgressBar, Spinner } from 'react-bootstrap'

const LABELS = {
  searching: 'Finding replays',
  fetching: 'Downloading replays',
  analysing: 'Crunching the numbers',
}

/**
 * Live feedback while an analysis runs. Downloading a few hundred replays takes
 * real time, so the user needs to see that something is happening — and roughly
 * how much is left.
 */
function AnalysisProgress({ progress }) {
  const { phase, done, total } = progress
  if (phase === 'idle' || phase === 'done' || phase === 'error') return null

  const label = LABELS[phase] ?? 'Working'
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <div className="d-flex align-items-center mb-3">
          <Spinner animation="border" size="sm" className="me-2" />
          <span className="fw-semibold">{label}</span>
          <span className="ms-auto text-muted small">
            {phase === 'searching'
              ? `${total} found`
              : `${done} / ${total}`}
          </span>
        </div>

        {/* Replay discovery has no known total, so it gets an indeterminate bar. */}
        <ProgressBar
          now={phase === 'searching' ? 100 : pct}
          striped={phase === 'searching'}
          animated
          label={phase === 'searching' ? null : `${pct}%`}
        />
      </Card.Body>
    </Card>
  )
}

export default AnalysisProgress
