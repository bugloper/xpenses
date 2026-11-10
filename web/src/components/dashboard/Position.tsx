import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Meter, Panel } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { loanTotals } from '@/lib/loans'
import { formatMoney } from '@/lib/money'
import { useAccounts, useLoans, useSavingsGoals } from '@/lib/queries'

function Line({
  label,
  hint,
  to,
  children,
}: {
  label: string
  hint?: ReactNode
  to: string
  children: ReactNode
}) {
  return (
    <Link to={to} className="hover:bg-muted/55 flex items-center gap-3 px-4 py-3 transition-colors sm:px-5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
      </span>
      <span className="text-sm font-medium">{children}</span>
      <ChevronRight className="text-muted-foreground/50 size-4 shrink-0" />
    </Link>
  )
}

/**
 * Where the user stands today, whatever period the dashboard shows: what
 * they are worth, the money they can use, what sits in savings, what others
 * owe them and what they owe. Goals are earmarks on that money, shown apart.
 */
export function Position({ currency }: { currency: string }) {
  const { data: accounts } = useAccounts()
  const { data: loans = [] } = useLoans()
  const { data: goals = [] } = useSavingsGoals()
  if (!accounts) return null
  const sum = (types: string[]) =>
    accounts.filter((a) => types.includes(a.type)).reduce((n, a) => n + a.current_balance, 0)
  const available = sum(['bank', 'cash', 'mobile_wallet'])
  const savings = sum(['savings'])
  const cards = sum(['credit_card'])
  const hasCards = accounts.some((a) => a.type === 'credit_card')
  const t = loanTotals(loans)
  const worth = available + savings + cards + t.owedToYou - t.youOwe
  const saved = goals.reduce((n, g) => n + g.saved, 0)
  const target = goals.reduce((n, g) => n + g.target_amount, 0)

  return (
    <Panel eyebrow="Today" title="Where you stand" flush>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col justify-between gap-3 border-b p-4 sm:p-5 md:border-r md:border-b-0">
          <div>
            <div className="eyebrow">Net worth</div>
            <div className="figure mt-2 text-[2.25rem] leading-none">{formatMoney(worth, currency)}</div>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Your accounts{loans.length > 0 ? ', plus what you are owed, less what you owe' : ''}. Unlike the
            statement above, it does not change with the period.
          </p>
        </div>
        <div className="divide-rule divide-y">
          <Line label="Available to spend" hint="Bank, cash and wallets" to="/accounts">
            <Money minor={available} currency={currency} />
          </Line>
          <Line label="In savings accounts" to="/savings">
            <Money minor={savings} currency={currency} />
          </Line>
          {hasCards && (
            <Line label="On credit cards" to="/accounts">
              <Money minor={cards} currency={currency} tone={cards < 0 ? 'expense' : 'neutral'} />
            </Line>
          )}
          {loans.length > 0 && (
            <>
              <Line
                label="Owed to you"
                hint={`${t.openGiven} open loan${t.openGiven === 1 ? '' : 's'}`}
                to="/loans"
              >
                <Money minor={t.owedToYou} currency={currency} />
              </Line>
              <Line
                label="You owe"
                hint={`${t.openReceived} open loan${t.openReceived === 1 ? '' : 's'}`}
                to="/loans"
              >
                <Money minor={-t.youOwe} currency={currency} tone={t.youOwe > 0 ? 'expense' : 'neutral'} />
              </Line>
            </>
          )}
        </div>
      </div>
      {goals.length > 0 && (
        <Link
          to="/savings"
          className="hover:bg-muted/55 block border-t px-4 py-3.5 transition-colors sm:px-5"
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              Set aside for {goals.length} goal{goals.length === 1 ? '' : 's'}
            </span>
            <span className="shrink-0 font-medium">
              {formatMoney(saved, currency)}{' '}
              <span className="text-muted-foreground font-normal">of {formatMoney(target, currency)}</span>
            </span>
          </div>
          <Meter value={target > 0 ? (saved * 100) / target : 0} tone="saffron" className="mt-2" />
          <p className="text-muted-foreground mt-1.5 text-xs">
            An earmark on the money above, not extra money.
          </p>
        </Link>
      )}
    </Panel>
  )
}
