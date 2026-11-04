import { createRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { PageHeader } from '@/components/common/PageHeader'
import { AccountsTab } from '@/components/reports/AccountsTab'
import { BudgetsTab } from '@/components/reports/BudgetsTab'
import { CategoriesTab } from '@/components/reports/CategoriesTab'
import { ExportButtons } from '@/components/reports/ExportButtons'
import { MerchantsTab } from '@/components/reports/MerchantsTab'
import { OverviewTab } from '@/components/reports/OverviewTab'
import { ReconciliationTab } from '@/components/reports/ReconciliationTab'
import { ReportsPeriodSelector } from '@/components/reports/ReportsPeriodSelector'
import { SpendingTab } from '@/components/reports/SpendingTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { currentMonth, rangeLabel, rangeMonth } from '@/lib/dates'
import { useDefaultCurrency, useStatements } from '@/lib/queries'
import {
  defaultGranularity,
  isMonth,
  periodSearch,
  resolveReportRange,
  type ExportParams,
} from '@/lib/reports'
import type { ExportReport } from '@/types/api'
import { appRoute } from './__root'

const TABS = [
  'overview',
  'categories',
  'spending',
  'merchants',
  'accounts',
  'budgets',
  'reconciliation',
] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  categories: 'Categories',
  spending: 'Spending',
  merchants: 'Merchants',
  accounts: 'Accounts',
  budgets: 'Budgets',
  reconciliation: 'Reconciliation',
}
const TAB_REPORT: Record<Tab, ExportReport> = {
  overview: 'summary',
  categories: 'categories',
  spending: 'cash-flow',
  merchants: 'merchants',
  accounts: 'accounts',
  budgets: 'budgets',
  reconciliation: 'reconciliation',
}

const searchSchema = z.object({
  tab: z.enum(TABS).optional().catch(undefined),
  period: z.enum(['month', 'prev_month', 'week', 'last3', 'custom']).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  gran: z.enum(['day', 'week', 'month']).optional().catch(undefined),
  spend: z.enum(['day', 'week']).optional().catch(undefined),
  type: z.enum(['expense', 'income']).optional().catch(undefined),
  month: z.string().optional().catch(undefined),
  statement: z.string().optional().catch(undefined),
})
export type ReportsSearchParams = z.infer<typeof searchSchema>

function ReportsPage() {
  const search = reportsRoute.useSearch()
  const navigate = reportsRoute.useNavigate()
  const currency = useDefaultCurrency()
  const tab: Tab = search.tab ?? 'overview'
  const { preset, range } = useMemo(() => resolveReportRange(search), [search])
  const granularity = search.gran ?? defaultGranularity(range)
  const spend = search.spend ?? 'day'
  const type = search.type ?? 'expense'
  const month = isMonth(search.month) ? search.month : rangeMonth(range) || currentMonth()
  // The reconciliation export needs a concrete statement id even before the user picks one.
  const statements = useStatements()
  const statementId = search.statement ?? statements.data?.[0]?.id

  const patch = (p: Partial<ReportsSearchParams>) =>
    void navigate({ search: (s) => ({ ...s, ...p }), replace: true })

  const exportParams: ExportParams = {
    from: range.from,
    to: range.to,
    granularity: tab === 'spending' ? spend : granularity,
    type,
    month,
    statement_id: statementId,
  }
  const periodless = tab === 'budgets' || tab === 'reconciliation'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reports"
        description={
          periodless
            ? tab === 'budgets'
              ? 'Monthly budgets'
              : 'Statement reconciliation'
            : rangeLabel(range)
        }
        actions={
          <ExportButtons
            report={TAB_REPORT[tab]}
            params={exportParams}
            disabled={tab === 'reconciliation' && !statementId}
          />
        }
      />
      {!periodless && (
        <ReportsPeriodSelector preset={preset} range={range} onChange={(p, r) => patch(periodSearch(p, r))} />
      )}
      <Tabs value={tab} onValueChange={(v) => patch({ tab: v === 'overview' ? undefined : (v as Tab) })}>
        <div className="-mx-4 scrollbar-none overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <TabsList aria-label="Report" className="w-max min-w-full lg:w-fit lg:min-w-0">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="px-3">
                {TAB_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-2">
          {tab === 'overview' && (
            <OverviewTab
              range={range}
              granularity={granularity}
              onGranularity={(g) => patch({ gran: g })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="categories" className="mt-2">
          {tab === 'categories' && (
            <CategoriesTab
              range={range}
              type={type}
              onType={(t) => patch({ type: t === 'expense' ? undefined : t })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="spending" className="mt-2">
          {tab === 'spending' && (
            <SpendingTab
              range={range}
              granularity={spend}
              onGranularity={(g) => patch({ spend: g === 'day' ? undefined : g })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="merchants" className="mt-2">
          {tab === 'merchants' && (
            <MerchantsTab
              range={range}
              type={type}
              onType={(t) => patch({ type: t === 'expense' ? undefined : t })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="accounts" className="mt-2">
          {tab === 'accounts' && <AccountsTab range={range} />}
        </TabsContent>
        <TabsContent value="budgets" className="mt-2">
          {tab === 'budgets' && (
            <BudgetsTab
              month={month}
              onMonth={(m) => patch({ month: m === currentMonth() ? undefined : m })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-2">
          {tab === 'reconciliation' && (
            <ReconciliationTab
              statementId={statementId}
              onStatement={(id) => patch({ statement: id })}
              currency={currency}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports',
  validateSearch: searchSchema,
  component: ReportsPage,
})
