import { Link } from '@tanstack/react-router'
import { Store } from 'lucide-react'
import { useMemo } from 'react'
import { Money } from '@/components/common/Money'
import { Segmented } from '@/components/common/Segmented'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import type { DateRange } from '@/lib/dates'
import { useReportMerchants } from '@/lib/queries'
import { pct1, pctOf } from '@/lib/reports'
import type { FlowType } from '@/types/api'

export function MerchantsTab({
  range,
  type,
  onType,
  currency,
}: {
  range: DateRange
  type: FlowType
  onType: (t: FlowType) => void
  currency: string
}) {
  const q = useReportMerchants(range.from, range.to, type)
  const rows = useMemo(() => (q.data ?? []).filter((r) => r.amount > 0), [q.data])
  const total = rows.reduce((n, r) => n + r.amount, 0)
  const top = rows[0]
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        aria-label="Flow type"
        value={type}
        onChange={onType}
        options={[
          { value: 'expense', label: 'Paid to', tone: 'expense' },
          { value: 'income', label: 'Received from', tone: 'income' },
        ]}
      />
      <section className="bg-card border rounded-[1.25rem] p-2">
        {q.isPending ? (
          <ListSkeleton rows={6} className="p-2" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No merchants in this period"
            description="Add a payee to your transactions to see them ranked here."
            className="py-8"
          />
        ) : (
          <ol aria-label="Ranked merchants" className="flex flex-col">
            {rows.map((r, i) => {
              const share = top ? pctOf(r.amount, top.amount) : 0
              const noPayee = r.payee === '(no payee)' || r.payee === ''
              const inner = (
                <>
                  <span className="text-muted-foreground tabular w-6 shrink-0 text-right text-xs">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{noPayee ? '(no payee)' : r.payee}</span>
                      <Money
                        minor={r.amount}
                        currency={currency}
                        className="shrink-0 text-sm font-semibold"
                      />
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
                        <span
                          className={
                            type === 'expense'
                              ? 'bg-expense/70 block h-full rounded-full'
                              : 'bg-income/70 block h-full rounded-full'
                          }
                          style={{ width: `${share}%` }}
                        />
                      </span>
                      <span className="text-muted-foreground tabular shrink-0 text-[11px]">
                        {pct1(r.amount, total)}% · {r.count}×
                      </span>
                    </span>
                  </span>
                </>
              )
              const cls = 'hover:bg-muted/60 flex items-center gap-3 rounded-xl px-2 py-2'
              return (
                <li key={`${r.payee}-${i}`}>
                  {noPayee ? (
                    <div className={cls}>{inner}</div>
                  ) : (
                    <Link
                      to="/transactions"
                      search={{ q: r.payee, from: range.from, to: range.to, tab: type }}
                      className={cls}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
