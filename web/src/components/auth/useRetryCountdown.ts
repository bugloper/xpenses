import { useEffect, useState } from 'react'

/**
 * Seconds left before the server accepts another attempt, counting down from
 * `error.retryAfter` from the moment that error object is set. 0 when there is
 * nothing to wait for. The elapsed count is keyed on the error object, so a new
 * error restarts the countdown without extra state resets.
 */
export function useRetryCountdown(error: { retryAfter?: number } | null): number {
  const [tick, setTick] = useState<{ error: unknown; elapsed: number }>({ error: null, elapsed: 0 })
  const total = error?.retryAfter ?? 0
  useEffect(() => {
    if (!total) return
    const id = setInterval(() => {
      setTick((t) => {
        const elapsed = (t.error === error ? t.elapsed : 0) + 1
        if (elapsed >= total) clearInterval(id)
        return { error, elapsed }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [error, total])
  if (!total) return 0
  const elapsed = tick.error === error ? tick.elapsed : 0
  return Math.max(0, total - elapsed)
}
