import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <RouterProvider router={router} />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
