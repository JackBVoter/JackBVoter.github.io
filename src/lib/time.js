// Compact relative timestamps ("3h ago") for replay lists.

const UNITS = [
  { limit: 60, divisor: 1, suffix: 's' },
  { limit: 3600, divisor: 60, suffix: 'm' },
  { limit: 86400, divisor: 3600, suffix: 'h' },
  { limit: 2592000, divisor: 86400, suffix: 'd' },
  { limit: 31536000, divisor: 2592000, suffix: 'mo' },
]

/**
 * @param {number} ms - epoch milliseconds
 * @param {number} [now] - injectable for testing
 */
export function timeAgo(ms, now = Date.now()) {
  if (!ms) return ''
  const seconds = Math.max(0, Math.round((now - ms) / 1000))

  for (const { limit, divisor, suffix } of UNITS) {
    if (seconds < limit) return `${Math.floor(seconds / divisor)}${suffix} ago`
  }
  return `${Math.floor(seconds / 31536000)}y ago`
}
