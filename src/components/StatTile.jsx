import { Card } from 'react-bootstrap'

/** A single headline number with a label and optional supporting detail. */
function StatTile({ label, value, hint, variant = 'body' }) {
  return (
    <Card className="h-100 shadow-sm">
      <Card.Body className="py-3">
        <div className="text-uppercase text-muted small fw-semibold">{label}</div>
        <div className={`display-6 fw-bold lh-1 mt-1 text-${variant}`}>{value}</div>
        {hint ? <div className="text-muted small mt-1">{hint}</div> : null}
      </Card.Body>
    </Card>
  )
}

export default StatTile
