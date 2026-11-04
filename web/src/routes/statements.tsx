// Placeholder: the statements agent replaces this file's contents. Keep the
// exported route names stable (`statementsRoute`, `statementDetailRoute`).
import { createRoute } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/States'
import { rootRoute } from './__root'

function StatementsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bank Statements"
        description="Import BOB PDF statements and review the parsed transactions."
      />
      <EmptyState icon={FileText} title="Coming next" description="Statement import is being built." />
    </div>
  )
}

function StatementDetailPage() {
  const { id } = statementDetailRoute.useParams()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Statement" description={id} />
      <EmptyState icon={FileText} title="Coming next" description="Statement detail is being built." />
    </div>
  )
}

export const statementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/statements',
  component: StatementsPage,
})
export const statementDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/statements/$id',
  component: StatementDetailPage,
})
