// Placeholder: the reports agent replaces this file's contents. Keep the
// exported route name stable (`reportsRoute`).
import { createRoute } from '@tanstack/react-router'
import { PieChart } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/States'
import { rootRoute } from './__root'

function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Spending by category, merchants, cash flow and exports." />
      <EmptyState icon={PieChart} title="Coming next" description="Reports are being built." />
    </div>
  )
}

export const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  component: ReportsPage,
})
