// Placeholder: the reconciliation agent replaces this file's contents. Keep the
// exported route names stable (`reconciliationRoute`, `reconciliationWorkspaceRoute`).
import { createRoute } from '@tanstack/react-router'
import { Scale } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/States'
import { rootRoute } from './__root'

function ReconciliationPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reconciliation"
        description="Match bank statement lines against your manual transactions."
      />
      <EmptyState icon={Scale} title="Coming next" description="Reconciliation is being built." />
    </div>
  )
}

function ReconciliationWorkspacePage() {
  const { statementId } = reconciliationWorkspaceRoute.useParams()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reconcile statement" description={statementId} />
      <EmptyState
        icon={Scale}
        title="Coming next"
        description="The reconciliation workspace is being built."
      />
    </div>
  )
}

export const reconciliationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reconciliation',
  component: ReconciliationPage,
})
export const reconciliationWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reconciliation/$statementId',
  component: ReconciliationWorkspacePage,
})
