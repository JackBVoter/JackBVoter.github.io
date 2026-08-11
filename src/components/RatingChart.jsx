import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from 'react-bootstrap'

import { timeAgo } from '../lib/time.js'

/**
 * "Ladder Rank Over Time" — Elo across the analyzed replays, chronological.
 *
 * Hand-rolled SVG rather than a charting library: this is the app's only chart,
 * and Recharts would roughly double a 100 kB bundle for one line.
 *
 * Design rules this follows:
 * - One series, so no legend — the card title names it. Colour carries no
 *   meaning beyond "this is the data", and every label is drawn in normal text
 *   ink rather than the series colour.
 * - One y-axis. Never a second scale.
 * - Thin marks and recessive grid: 2px line, 1px gridlines in the theme's
 *   border colour, axis labels in muted ink.
 * - Direct labels are selective — the latest value is called out on the plot,
 *   not a number on every point.
 * - Colours come from Bootstrap CSS variables, so the chart follows the app's
 *   theme (including dark) instead of hard-coding hexes that only work on one
 *   background.
 */

const HEIGHT = 240
const PAD = { top: 18, right: 56, bottom: 28, left: 46 }

// Enough room to hit comfortably; the visible dot stays much smaller.
const HOVER_RADIUS = 5

/** Candidate gridline steps, smallest first — Elo moves in tens. */
const TICK_STEPS = [5, 10, 20, 25, 50, 100, 200, 500]
const MAX_TICKS = 5

/**
 * Round the value range out to whole gridline steps, so the axis reads 1500 /
 * 1550 / 1600 rather than 1487 / 1533 / 1579.
 */
function niceScale(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1, ticks: [] }
  // A flat line still needs a band to sit in, or it would divide by zero.
  if (hi === lo) return { lo: lo - 20, hi: hi + 20, ticks: [lo - 20, lo, lo + 20] }

  const step =
    TICK_STEPS.find((candidate) => (hi - lo) / candidate <= MAX_TICKS) ??
    TICK_STEPS[TICK_STEPS.length - 1]
  const low = Math.floor(lo / step) * step
  const high = Math.ceil(hi / step) * step

  const ticks = []
  for (let value = low; value <= high; value += step) ticks.push(value)
  return { lo: low, hi: high, ticks }
}

/**
 * The rendered width of an element. Measured rather than handed to a viewBox
 * that scales: scaling a viewBox shrinks the axis text along with the plot, so
 * on a phone the labels would end up unreadable.
 */
function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

const shortDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function RatingChart({ points = [], title = 'Ladder Rank Over Time' }) {
  const [wrapRef, width] = useElementWidth()
  const [active, setActive] = useState(null)

  const count = points.length

  // Nearest point to the pointer, horizontally. Nearest-x rather than
  // nearest-in-2D so the readout never skips to a far point that happens to
  // sit at a similar height.
  const pickNearest = useCallback(
    (clientX, svg, scaleX) => {
      const box = svg.getBoundingClientRect()
      const x = clientX - box.left
      let best = 0
      let bestGap = Infinity
      for (let i = 0; i < count; i += 1) {
        const gap = Math.abs(scaleX(i) - x)
        if (gap < bestGap) {
          bestGap = gap
          best = i
        }
      }
      return best
    },
    [count],
  )

  const subtitle = 'Elo entering each rated battle'

  if (count === 0) {
    return (
      <Card className="h-100 shadow-sm">
        <Card.Body className="pb-3">
          <Card.Title className="h6 mb-1">{title}</Card.Title>
          <div className="text-muted small">
            No rated battles in this sample, so there is no Elo to plot.
            Unrated games and tournament replays don&apos;t carry a rating.
          </div>
        </Card.Body>
      </Card>
    )
  }

  const elos = points.map((p) => p.elo)
  const peak = Math.max(...elos)
  const latest = points[count - 1]
  const first = points[0]
  const change = latest.elo - first.elo

  const { lo, hi, ticks } = niceScale(Math.min(...elos), peak)

  const innerW = Math.max(width - PAD.left - PAD.right, 10)
  const innerH = HEIGHT - PAD.top - PAD.bottom

  // Spread by time so a two-week gap reads as a gap. When every battle shares a
  // timestamp (or there is only one), fall back to even spacing.
  const span = latest.time - first.time
  const scaleX = (i) =>
    PAD.left + (span > 0 ? ((points[i].time - first.time) / span) * innerW : (count > 1 ? (i / (count - 1)) * innerW : innerW / 2))
  const scaleY = (elo) => PAD.top + (1 - (elo - lo) / (hi - lo)) * innerH

  const ready = width > 0
  const line = ready ? points.map((p, i) => `${scaleX(i)},${scaleY(p.elo)}`).join(' ') : ''
  const activePoint = active === null ? null : points[active]

  return (
    <Card className="h-100 shadow-sm">
      <Card.Body className="pb-2">
        <Card.Title className="h6 mb-1">{title}</Card.Title>
        <div className="text-muted small mb-2">
          {subtitle}
          {count > 1 ? ' · hover for detail, click a point to open the replay' : null}
        </div>

        {/* The headline numbers, in text ink. A reader who never touches the
            chart still gets the summary. */}
        <div className="d-flex flex-wrap gap-4 mb-2">
          <div>
            <div className="text-uppercase text-muted small fw-semibold">Latest</div>
            <div className="fs-5">{latest.elo}</div>
          </div>
          <div>
            <div className="text-uppercase text-muted small fw-semibold">Peak</div>
            <div className="fs-5">{peak}</div>
          </div>
          <div>
            <div className="text-uppercase text-muted small fw-semibold">
              Change
            </div>
            <div
              className={`fs-5 ${
                change > 0 ? 'text-success' : change < 0 ? 'text-danger' : ''
              }`}
            >
              {change > 0 ? '+' : ''}
              {change}
            </div>
          </div>
        </div>

        <div ref={wrapRef} className="position-relative">
          {ready && count > 1 ? (
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`Elo over ${count} rated battles: from ${first.elo} to ${latest.elo}, peaking at ${peak}.`}
              tabIndex={0}
              style={{ display: 'block', cursor: activePoint ? 'pointer' : 'default' }}
              onPointerMove={(event) =>
                setActive(pickNearest(event.clientX, event.currentTarget, scaleX))
              }
              onPointerLeave={() => setActive(null)}
              onClick={() => {
                if (activePoint) {
                  window.open(
                    `https://replay.pokemonshowdown.com/${activePoint.id}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              }}
              // Arrow keys walk the series, so the readout isn't mouse-only.
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault()
                  const step = event.key === 'ArrowRight' ? 1 : -1
                  setActive((current) => {
                    const next = (current ?? 0) + step
                    return Math.min(Math.max(next, 0), count - 1)
                  })
                }
              }}
            >
              {/* Grid and axis: recessive, behind the data. */}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + innerW}
                    y1={scaleY(tick)}
                    y2={scaleY(tick)}
                    stroke="var(--bs-border-color)"
                    strokeWidth="1"
                  />
                  <text
                    x={PAD.left - 8}
                    y={scaleY(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="var(--bs-secondary-color)"
                  >
                    {tick}
                  </text>
                </g>
              ))}

              {/* Only the endpoints are dated — a label under every point would
                  be noise at 50 battles. */}
              <text
                x={PAD.left}
                y={HEIGHT - 8}
                fontSize="11"
                fill="var(--bs-secondary-color)"
              >
                {shortDate(first.time)}
              </text>
              <text
                x={PAD.left + innerW}
                y={HEIGHT - 8}
                textAnchor="end"
                fontSize="11"
                fill="var(--bs-secondary-color)"
              >
                {shortDate(latest.time)}
              </text>

              <polyline
                points={line}
                fill="none"
                stroke="var(--bs-primary)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Individual battles, but only while they stay legible. Each gets
                  a surface-coloured ring so overlapping dots read as separate
                  marks rather than one blob. */}
              {count <= 60
                ? points.map((p, i) => (
                    <circle
                      key={p.id}
                      cx={scaleX(i)}
                      cy={scaleY(p.elo)}
                      r="2.5"
                      fill="var(--bs-primary)"
                      stroke="var(--bs-body-bg)"
                      strokeWidth="2"
                    />
                  ))
                : null}

              {/* Direct label on the latest value only. */}
              <text
                x={PAD.left + innerW + 8}
                y={scaleY(latest.elo)}
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="600"
                fill="var(--bs-body-color)"
              >
                {latest.elo}
              </text>

              {activePoint ? (
                <g>
                  <line
                    x1={scaleX(active)}
                    x2={scaleX(active)}
                    y1={PAD.top}
                    y2={PAD.top + innerH}
                    stroke="var(--bs-secondary-color)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={scaleX(active)}
                    cy={scaleY(activePoint.elo)}
                    r={HOVER_RADIUS}
                    fill="var(--bs-primary)"
                    stroke="var(--bs-body-bg)"
                    strokeWidth="2"
                  />
                </g>
              ) : null}
            </svg>
          ) : null}

          {ready && count === 1 ? (
            <div className="text-muted small pb-2">
              Only one rated battle in this sample ({first.elo},{' '}
              {timeAgo(first.time)}) — not enough for a trend.
            </div>
          ) : null}

          {activePoint ? (
            <div
              className="position-absolute bg-body border rounded shadow-sm px-2 py-1 small"
              style={{
                left: Math.min(Math.max(scaleX(active), 70), Math.max(width - 70, 70)),
                top: scaleY(activePoint.elo) - 12,
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 2,
              }}
            >
              <div className="fw-semibold">{activePoint.elo} Elo</div>
              <div className="text-muted">
                {activePoint.result === 'win'
                  ? 'Win'
                  : activePoint.result === 'loss'
                    ? 'Loss'
                    : 'Undecided'}{' '}
                · {timeAgo(activePoint.time)}
              </div>
            </div>
          ) : null}
        </div>

        {/* The same series as text, for screen readers and for anyone who wants
            the numbers rather than the shape. */}
        <table className="visually-hidden">
          <caption>{`${title} — ${subtitle}`}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Elo</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.time).toLocaleDateString()}</td>
                <td>{p.elo}</td>
                <td>{p.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card.Body>
    </Card>
  )
}

export default RatingChart
