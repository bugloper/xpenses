import { createRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { PageHeader } from '@/components/common/PageHeader'
import { AccountsTab } from '@/components/reports/AccountsTab'
import { CategoriesTab } from '@/components/reports/CategoriesTab'
import { ExportButtons } from '@/components/reports/ExportButtons'
import { OverviewTab } from '@/components/reports/OverviewTab'
import { ReportsPeriodSelector } from '@/components/reports/ReportsPeriodSelector'
import { SpendingTab } from '@/components/reports/SpendingTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { rangeLabel } from '@/lib/dates'
import { useDefaultCurrency } from '@/lib/queries'
import {
  defaultGranularity,
  periodSearch,
  REPORT_PRESETS,
  resolveReportRange,
  type ExportParams,
} from '@/lib/reports'
import type { ExportReport } from '@/types/api'
import { appRoute } from './__root'

// Budgets have their own page (with the month picker), so there is no budgets
// tab here; the merchants list was dropped as noise.
const TABS = ['overview', 'categories', 'spending', 'accounts'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  categories: 'Categories',
  spending: 'Spending',
  accounts: 'Accounts',
}
const TAB_REPORT: Record<Tab, ExportReport> = {
  overview: 'summary',
  categories: 'categories',
  spending: 'cash-flow',
  accounts: 'accounts',
}

const searchSchema = z.object({
  tab: z.enum(TABS).optional().catch(undefined),
  period: z.enum(['month', 'prev_month', 'week', 'last3', 'custom']).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  gran: z.enum(['day', 'week', 'month']).optional().catch(undefined),
  spend: z.enum(['day', 'week']).optional().catch(undefined),
  type: z.enum(['expense', 'income']).optional().catch(undefined),
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

  const patch = (p: Partial<ReportsSearchParams>) =>
    void navigate({ search: (s) => ({ ...s, ...p }), replace: true })

  const exportParams: ExportParams = {
    from: range.from,
    to: range.to,
    granularity: tab === 'spending' ? spend : granularity,
    type,
  }

  const presetLabel = REPORT_PRESETS.find((p) => p.value === preset)?.label ?? 'Custom range'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`Statement · ${presetLabel}`}
        title="Reports"
        description={<span className="font-display text-foreground/80 text-lg">{rangeLabel(range)}</span>}
        actions={<ExportButtons report={TAB_REPORT[tab]} params={exportParams} />}
        rule={false}
      />
      <Tabs
        value={tab}
        onValueChange={(v) => patch({ tab: v === 'overview' ? undefined : (v as Tab) })}
        className="gap-6"
      >
        <div className="flex flex-col gap-4">
          <ReportsPeriodSelector
            preset={preset}
            range={range}
            onChange={(p, r) => patch(periodSearch(p, r))}
          />
          <div className="-mx-4 scrollbar-none overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
            <TabsList
              variant="line"
              aria-label="Report"
              className="h-auto gap-6 rounded-none p-0 group-data-horizontal/tabs:h-auto sm:gap-8"
            >
              {TABS.map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className="font-display after:bg-saffron text-muted-foreground data-active:text-foreground h-11 flex-none rounded-none px-0 text-[1.0625rem] font-normal tracking-normal group-data-horizontal/tabs:after:bottom-[-1px] group-data-horizontal/tabs:after:h-[3px] focus-visible:underline focus-visible:ring-0 focus-visible:outline-none data-active:font-medium"
                >
                  {TAB_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <TabsContent value="overview">
          {tab === 'overview' && (
            <OverviewTab
              range={range}
              granularity={granularity}
              onGranularity={(g) => patch({ gran: g })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="categories">
          {tab === 'categories' && (
            <CategoriesTab
              range={range}
              type={type}
              onType={(t) => patch({ type: t === 'expense' ? undefined : t })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="spending">
          {tab === 'spending' && (
            <SpendingTab
              range={range}
              granularity={spend}
              onGranularity={(g) => patch({ spend: g === 'day' ? undefined : g })}
              currency={currency}
            />
          )}
        </TabsContent>
        <TabsContent value="accounts">{tab === 'accounts' && <AccountsTab range={range} />}</TabsContent>
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
