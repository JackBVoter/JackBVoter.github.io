import { Form } from 'react-bootstrap'

export const ALL_FORMATS = ''

/**
 * Scope a player's dashboards to one format.
 *
 * Only lists formats the player actually has replays in, with counts, so the
 * choice can't promise data that isn't there. This control exists because
 * blending formats is actively misleading: a player ranked on the VGC 2026
 * Reg M-B ladder may have no replays in it at all, and showing them another
 * format's Terastallization stats reads as invented data.
 *
 * @param {Array<{formatId, label, count}>} formatCounts - most-played first
 */
function FormatFilter({
  value,
  onChange,
  formatCounts = [],
  disabled = false,
  total = 0,
  capped = false,
}) {
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
        value={value ?? ALL_FORMATS}
        disabled={disabled}
        aria-label="Filter dashboards by format"
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value={ALL_FORMATS}>
          All formats ({total}
          {suffix})
        </option>
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
