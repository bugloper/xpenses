import { Banknote, CreditCard, Landmark, PiggyBank, Smartphone, type LucideIcon } from 'lucide-react'
import type { AccountType } from '@/types/api'
import { cn } from '@/lib/utils'

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: LucideIcon; color: string }> = {
  bank: { label: 'Bank', icon: Landmark, color: '#3b82f6' },
  cash: { label: 'Cash', icon: Banknote, color: '#22c55e' },
  mobile_wallet: { label: 'Mobile wallet', icon: Smartphone, color: '#a855f7' },
  credit_card: { label: 'Credit card', icon: CreditCard, color: '#f97316' },
  savings: { label: 'Savings', icon: PiggyBank, color: '#14b8a6' },
}

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_META[type as AccountType]?.label ?? type
}

export function AccountIcon({
  type,
  className,
  size = 'md',
}: {
  type: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const meta = ACCOUNT_TYPE_META[type as AccountType] ?? ACCOUNT_TYPE_META.bank
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl',
        size === 'sm' ? 'size-8 [&>svg]:size-4' : 'size-10 [&>svg]:size-5',
        className,
      )}
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
      aria-hidden
    >
      <Icon strokeWidth={2.2} />
    </span>
  )
}
