/**
 * A small data-fetching hook.
 *
 * The application has a handful of read endpoints and no cache invalidation
 * problem worth a query library, so this covers it: a loading flag, a typed
 * error, and a refetch. Every page renders all three states from the same
 * shape, which is why none of them can end up blank.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'

export interface AsyncState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  refetch: () => void
  /** True only on the first load, so a refresh does not blank the page. */
  initialising: boolean
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const loadedOnce = useRef(false)

  // The fetcher is rebuilt on every render by its caller, so the effect keys off
  // the caller's declared dependencies instead.
  const stable = useRef(fetcher)
  stable.current = fetcher

  useEffect(() => {
    let active = true
    setLoading(true)

    stable
      .current()
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
        loadedOnce.current = true
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(0, 'Something went wrong while loading this view.'),
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refetch = useCallback(() => setNonce((value) => value + 1), [])

  return { data, error, loading, refetch, initialising: loading && !loadedOnce.current }
}
