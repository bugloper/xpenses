import { Link } from '@tanstack/react-router'
import { CheckCircle2, ChevronRight, CircleAlert, FileText, Scale } from 'lucide-react'
import { AccountIcon } from '@/components/common/AccountIcon'
import { Button } from '@/components/ui/button'
import { formatShortDate, rangeLabel, relativeTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { Account, Statement } from '@/types/api'

/** Three-segment matched / ignored / unmatched bar. */
export function ReconciliationProgress({
  matched,
  ignored,
  unmatched,
  className,
}: {
  matched: number
  ignored: number
  unmatched: number
  className?: string
}) {
  const total = matched + ignored + unmatched
  const pct = (n: number) => (total > 0 ? `${Math.round((n * 1000) / total) / 10}%` : '0%')
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className="bg-muted flex h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={matched}
        aria-label={`${matched} of ${total} matched`}
      >
        <div className="bg-income h-full" style={{ width: pct(matched) }} />
        <div className="bg-muted-foreground/40 h-full" style={{ width: pct(ignored) }} />
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        <span>
          <span className="text-income font-medium">{matched}</span> matched
        </span>
        <span>
          <span className={cn('font-medium', unmatched > 0 ? 'text-warning' : '')}>{unmatched}</span>{' '}
          unmatched
        </span>
        <span>
          <span className="font-medium">{ignored}</span> ignored
        </span>
      </div>
    </div>
  )
}

export function StatementCard({ statement: s, account }: { statement: Statement; account?: Account }) {
  return (
    <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-2xl p-4 ring-1">
      <div className="flex items-start gap-3">
        {account ? (
          <AccountIcon type={account.type} />
        ) : (
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
            <FileText className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <Link
            to="/statements/$id"
            params={{ id: s.id }}
            className="flex items-center gap-1 font-medium hover:underline"
          >
            <span className="truncate">{s.file_name}</span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </Link>
          <p className="text-muted-foreground truncate text-xs">
            {account?.name ?? 'Account'} · {rangeLabel({ from: s.period_start, to: s.period_end })}
          </p>
        </div>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-[11px] font-medium',
            s.balance_verified ? 'text-income' : 'text-warning',
          )}
          title={s.balance_verified ? 'Closing balance verified' : 'Closing balance not verified'}
        >
          {s.balance_verified ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
          <span className="hidden sm:inline">{s.balance_verified ? 'Verified' : 'Unverified'}</span>
        </span>
      </div>
      <ReconciliationProgress
        matched={s.matched_count}
        ignored={s.ignored_count}
        unmatched={s.unmatched_count}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {s.transaction_count} transaction{s.transaction_count === 1 ? '' : 's'} · imported{' '}
          {relativeTime(s.imported_at) || formatShortDate(s.imported_at.slice(0, 10))}
        </span>
        <Button size="sm" variant={s.unmatched_count > 0 ? 'default' : 'outline'} asChild>
          <Link to="/reconciliation/$statementId" params={{ statementId: s.id }}>
            <Scale data-icon="inline-start" /> Reconcile
          </Link>
        </Button>
      </div>
    </div>
  )
}
