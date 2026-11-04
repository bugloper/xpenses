import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Tailwind `lg` breakpoint - desktop layout with sidebar. */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)')
}
