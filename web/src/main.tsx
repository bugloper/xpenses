import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { toast } from 'sonner'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { CSRF_REJECTED_EVENT, UNAUTHENTICATED_EVENT } from '@/lib/api'
import { isAuthPath, purgeSessionData } from '@/lib/auth'
import { persistOptions, queryClient } from '@/lib/queryClient'
import { syncManager } from '@/lib/offline'
import { transactionDependentKeys } from '@/lib/queries/keys'
import { router } from './router'
import './index.css'

// Offline queue: once an item reaches the server, refresh everything it affects.
syncManager.setOnSynced(() => {
  for (const k of transactionDependentKeys) void queryClient.invalidateQueries({ queryKey: k })
})
syncManager.start()

// Session lost (401 on any request): purge local data and go to /login, keeping
// the page the user was on so they land back there after signing in.
let signingOut = false
window.addEventListener(UNAUTHENTICATED_EVENT, () => {
  const { pathname, searchStr } = router.state.location
  if (isAuthPath(pathname) || signingOut) return
  signingOut = true
  void purgeSessionData().finally(() => {
    const current = pathname + searchStr
    void router
      .navigate({ to: '/login', search: current === '/' ? {} : { redirect: current }, replace: true })
      .finally(() => {
        signingOut = false
      })
  })
})

// The server rejected a mutation for lacking the client header: a bug, not a user error.
window.addEventListener(CSRF_REJECTED_EVENT, () => {
  toast.error('Request rejected by the server (client header missing). Please reload and report this.')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        // Restored data renders instantly, but it is last-known data: refetch
        // everything in the background so a reload never shows a stale ledger.
        onSuccess={() => {
          void queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())
        }}
      >
        <RouterProvider router={router} />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
