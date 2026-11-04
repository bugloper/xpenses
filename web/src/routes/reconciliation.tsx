import { createRoute, Link } from '@tanstack/react-router'
import { ArrowRight, FileText, Scale } from 'lucide-react'
import { z } from 'zod'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { Workspace } from '@/components/reconciliation/Workspace'
import { ReconciliationProgress } from '@/components/statements/StatementCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { rangeLabel } from '@/lib/dates'
import { useReconciliationOverview, useReconciliationWorkspace } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { rootRoute } from './__root'

function ReconciliationPage() {
  const { data, isPending, error, refetch } = useReconciliationOverview()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reconciliation" description="Match bank statement lines against your manual transactions." />
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <GlobalCount label="Unreconciled bank lines" value={data.unreconciled_bank_count} />
            <GlobalCount label="Unmatched manual entries" value={data.unmatched_manual_count} />
          </div>
          {data.statements.length === 0 ? (
            <div className="bg-card ring-foreground/10 rounded-2xl ring-1">
              <EmptyState
                icon={Scale}
                title="Nothing to reconcile yet"
                description="Import a bank statement first; each statement gets its own workspace here."
                action={
                  <Button asChild>
                    <Link to="/statements" search={{ import: '1' }}>
                      <FileText data-icon="inline-start" /> Import statement
                    </Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {data.statements.map((s) => (
                <li key={s.statement_id}>
                  <Link
                    to="/reconciliation/$statementId"
                    params={{ statementId: s.statement_id }}
                    className="bg-card ring-foreground/10 hover:bg-muted/40 flex flex-col gap-3 rounded-2xl p-4 ring-1 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.file_name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {s.account_name} · {rangeLabel({ from: s.period_start, to: s.period_end })}
                        </p>
                      </div>
                      <span className={cn('flex shrink-0 items-center gap-1 text-xs font-medium', s.unrecorded > 0 ? 'text-warning' : 'text-income')}>
                        {s.unrecorded > 0 ? `${s.unrecorded} to review` : 'Complete'} <ArrowRight className="size-3.5" />
                      </span>
                    </div>
                    <ReconciliationProgress matched={s.matched + s.transfer} ignored={s.ignored} unmatched={s.unrecorded} />
                    <p className="text-muted-foreground text-[11px]">
                      {s.total} line{s.total === 1 ? '' : 's'}
                      {s.transfer > 0 && ` · ${s.transfer} transfer${s.transfer === 1 ? '' : 's'}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function GlobalCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card ring-foreground/10 flex flex-col rounded-2xl px-4 py-3 ring-1">
      <span className={cn('tabular text-2xl font-semibold', value > 0 ? 'text-warning' : 'text-income')}>{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

const workspaceSearch = z.object({ prompt: z.enum(['auto-match']).optional().catch(undefined) })

function ReconciliationWorkspacePage() {
  const { statementId } = reconciliationWorkspaceRoute.useParams()
  const search = reconciliationWorkspaceRoute.useSearch()
  const navigate = reconciliationWorkspaceRoute.useNavigate()
  const { data, isPending, error, refetch } = useReconciliationWorkspace(statementId)
  if (isPending)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="hidden h-72 w-full rounded-2xl lg:block" />
          <Skeleton className="hidden h-72 w-full rounded-2xl lg:block" />
        </div>
      </div>
    )
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  return (
    <Workspace
      ws={data}
      promptAutoMatch={search.prompt === 'auto-match'}
      onPromptHandled={() => void navigate({ search: {}, replace: true })}
    />
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
  validateSearch: workspaceSearch,
  component: ReconciliationWorkspacePage,
})
