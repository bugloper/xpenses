import { createRootRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorState } from '@/components/common/States'

export const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <ErrorState error={error} onRetry={reset} />
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6">
      <ErrorState error={new Error('This page does not exist.')} title="Not found" />
    </div>
  ),
})
