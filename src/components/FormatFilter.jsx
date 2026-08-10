import { Form } from 'react-bootstrap'

import { findFormat } from '../data/formats.js'

/**
 * Scope a player's dashboards to one format.
 *
 * Only lists formats the player actually has replays in, with counts, so the
 * choice can't promise data that isn't there. This control exists because
 * blending formats is actively misleading: a player ranked on the VGC 2026
 * Reg M-B ladder may have no replays in it at all, and showing them another
 * format's Terastallization stats reads as invented data.
 *
 * There is deliberately no "all formats" choice. It was the one option that
 * produced numbers describing no real game, and it also meant the game-count
 * picker bought a mixed bag — asking for 50 games got 50 replays spread across
 * whatever the player happened to play, not 50 of anything.
 *
 * @param {Array<{formatId, label, count}>} formatCounts - most-played first
 */
function FormatFilter({
  value,
  onChange,
  formatCounts = [],
  disabled = false,
  loading = false,
  total = 0,
  capped = false,
}) {
  // Arriving from a ladder click can select a format the player has no replays
  // in, so it won't be in formatCounts. Without an option to match, the select
  // would silently display the first format in the list while the page reported
  // the real (empty) one — so give it an option of its own.
  const missing = value && !formatCounts.some((entry) => entry.formatId === value)
  // The format list comes from the most recent `total` replays. When that hit
  // the cap, the per-format counts are a floor rather than a total — mark them
  // "+" instead of printing a precise number that is quietly wrong. Selecting a
  // format then fetches that format's own listing and reports the real figure.
  const suffix = capped ? '+' : ''

  return (
    <div>
      <Form.Label className="text-uppercase text-muted small fw-semibold mb-2">
        Format
      </Form.Label>
      <Form.Select
        value={value ?? ''}
        disabled={disabled || formatCounts.length === 0}
        aria-label="Choose which format's games to analyse"
        onChange={(event) => onChange(event.target.value || null)}
      >
        {/* An empty list means either "still counting" or "this player has
            nothing" — very different messages, so don't guess. */}
        {formatCounts.length === 0 ? (
          <option value="">{loading ? 'Loading formats…' : 'No replays found'}</option>
        ) : null}
        {missing ? (
          <option value={value}>{findFormat(value)?.label ?? value} (0)</option>
        ) : null}
        {formatCounts.map((entry) => (
          <option key={entry.formatId} value={entry.formatId}>
            {entry.label} ({entry.count}
            {suffix})
          </option>
        ))}
      </Form.Select>

      {capped ? (
        <div className="text-muted small mt-1">
          Counts from the {total} most recent replays; a format may have more.
        </div>
      ) : null}
    </div>
  )
}

export default FormatFilter
