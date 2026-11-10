import { createRoute } from '@tanstack/react-router'
import { PiggyBank, Plus } from 'lucide-react'
import { useState } from 'react'
import { AccountIcon } from '@/components/common/AccountIcon'
import { Meter, Note, Panel, Row, Rows, Stat, StatGrid } from '@/components/common/kit'
import { Money } from '@/components/common/Money'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/States'
import { GoalFormSheet } from '@/components/savings/GoalFormSheet'
import { GoalSheet } from '@/components/savings/GoalSheet'
import { Button } from '@/components/ui/button'
import { formatShortDate, presetRange } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useAccounts, useDefaultCurrency, useReportSummary, useSavingsGoals } from '@/lib/queries'
import type { SavingsGoal } from '@/types/api'
import { appRoute } from './__root'

/**
 * Savings, three ways, kept apart: what is set aside for goals (allocations,
 * not money of their own), what sits in savings accounts (real balances),
 * and what this month's income left over after spending.
 */
function SavingsPage() {
  const goals = useSavingsGoals()
  const { data: accounts = [] } = useAccounts()
  const currency = useDefaultCurrency()
  const month = presetRange('month')
  const summary = useReportSummary(month.from, month.to)
  const [editing, setEditing] = useState<SavingsGoal | null | undefined>(undefined)
  const [openGoal, setOpenGoal] = useState<string | null>(null)

  const list = goals.data ?? []
  const allocated = list.reduce((n, g) => n + g.saved, 0)
  const toGo = list.reduce((n, g) => n + Math.max(0, g.target_amount - g.saved), 0)
  const savingsAccounts = accounts.filter((a) => a.type === 'savings')
  const inSavings = savingsAccounts.reduce((n, a) => n + a.current_balance, 0)
  const leftOver = summary.data ? summary.data.income - summary.data.expenses : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={goals.isPending ? 'Plans' : `Plans · ${list.length} goal${list.length === 1 ? '' : 's'}`}
        title="Savings"
        description="Goals you are saving for and the accounts that hold savings. Setting money aside is not spending, and moving it to a savings account is a transfer."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus data-icon="inline-start" /> New goal
          </Button>
        }
      />

      <StatGrid className="sm:grid-cols-3">
        <Stat
          label="Set aside for goals"
          value={formatMoney(allocated, currency)}
          hint={
            toGo > 0
              ? `${formatMoney(toGo, currency)} still to save`
              : list.length
                ? 'Every goal reached'
                : undefined
          }
        />
        <Stat
          label="In savings accounts"
          value={formatMoney(inSavings, currency)}
          to="/accounts"
          hint={`${savingsAccounts.length} savings account${savingsAccounts.length === 1 ? '' : 's'}`}
        />
        <Stat
          label="Left over this month"
          value={leftOver === null ? '…' : formatMoney(leftOver, currency)}
          tone={leftOver !== null && leftOver < 0 ? 'expense' : leftOver ? 'income' : undefined}
          hint="Income less spending so far"
          className="col-span-2 sm:col-span-1"
        />
      </StatGrid>

      {goals.isPending ? (
        <ListSkeleton rows={3} />
      ) : goals.error ? (
        <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
      ) : list.length === 0 ? (
        <div className="bg-card rounded-lg border">
          <EmptyState
            icon={PiggyBank}
            title="No savings goals yet"
            description="Name something to save for and how much. Add to it as you go; it never counts as spending."
            action={<Button onClick={() => setEditing(null)}>Create a goal</Button>}
          />
        </div>
      ) : (
        <Panel title="Goals" flush>
          <Rows>
            {list.map((g) => (
              <Row
                key={g.id}
                onClick={() => setOpenGoal(g.id)}
                title={g.name}
                subtitle={
                  <span className="flex flex-col gap-1.5">
                    <span>
                      {formatMoney(g.saved, currency)} of {formatMoney(g.target_amount, currency)}
                      {g.target_date ? ` · by ${formatShortDate(g.target_date)}` : ''}
                    </span>
                    <Meter value={g.pct} tone={g.reached ? 'income' : 'saffron'} />
                  </span>
                }
                trailing={
                  <span className="figure text-lg">{g.reached ? 'Reached' : `${Math.round(g.pct)}%`}</span>
                }
                chevron
              />
            ))}
          </Rows>
        </Panel>
      )}

      <Panel
        title="Savings accounts"
        description="Their balances are real money; goals only earmark it."
        flush
      >
        {savingsAccounts.length === 0 ? (
          <div className="p-4 sm:p-5">
            <Note>
              Keep savings apart in an account of type <strong>Savings</strong>, and move money into it with a
              transfer. Transfers are never spending.
            </Note>
          </div>
        ) : (
          <Rows>
            {savingsAccounts.map((a) => (
              <Row
                key={a.id}
                to={`/accounts/${a.id}`}
                leading={<AccountIcon type={a.type} />}
                title={a.name}
                trailing={<Money minor={a.current_balance} currency={a.currency} className="font-medium" />}
                chevron
              />
            ))}
          </Rows>
        )}
      </Panel>

      <GoalFormSheet
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        goal={editing ?? null}
        currency={currency}
        onSaved={(g) => editing === null && setOpenGoal(g.id)}
      />
      <GoalSheet
        goalId={openGoal}
        onOpenChange={(o) => !o && setOpenGoal(null)}
        onEdit={(g) => {
          setOpenGoal(null)
          setEditing(g)
        }}
      />
    </div>
  )
}

export const savingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/savings',
  component: SavingsPage,
})
