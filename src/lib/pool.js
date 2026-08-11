/**
 * Run an async `worker` over `items` with at most `concurrency` in flight.
 *
 * Analyzing a player means one HTTP request per replay, which can be hundreds.
 * Firing them all at once would hammer Showdown and get us rate-limited, so we
 * keep a small fixed number of workers pulling from a shared cursor.
 *
 * Failures never reject the whole run: a failed item resolves to
 * { ok: false, error } so one dead replay can't discard the other 199.
 * Results stay in the same order as `items`.
 */
export async function mapWithConcurrency(items, worker, options = {}) {
  const { concurrency = 6, onProgress, signal } = options

  const results = new Array(items.length)
  let cursor = 0
  let done = 0

  async function runWorker() {
    while (true) {
      if (signal?.aborted) return
      const index = cursor
      cursor += 1
      if (index >= items.length) return

      try {
        results[index] = { ok: true, value: await worker(items[index], index) }
      } catch (error) {
        results[index] = { ok: false, error }
      }

      done += 1
      onProgress?.({ done, total: items.length })
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  )
  await Promise.all(workers)

  return results
}

/** Keep the successful values from mapWithConcurrency's results. */
export function successes(results) {
  return results.filter((r) => r?.ok).map((r) => r.value)
}

/** Count how many items failed, for an honest "N replays couldn't be loaded". */
export function failureCount(results) {
  return results.filter((r) => r && !r.ok).length
}
