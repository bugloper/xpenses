import { Banknote, CreditCard, Landmark, PiggyBank, Smartphone, type LucideIcon } from 'lucide-react'
import type { AccountType } from '@/types/api'
import { cn } from '@/lib/utils'

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: LucideIcon; color: string }> = {
  bank: { label: 'Bank', icon: Landmark, color: '#2f6f5e' },
  cash: { label: 'Cash', icon: Banknote, color: '#8a7a2c' },
  mobile_wallet: { label: 'Mobile wallet', icon: Smartphone, color: '#5d61a0' },
  credit_card: { label: 'Credit card', icon: CreditCard, color: '#b4473a' },
  savings: { label: 'Savings', icon: PiggyBank, color: '#c8761a' },
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
        'inline-flex shrink-0 items-center justify-center rounded-md',
        size === 'sm' ? 'size-8 [&>svg]:size-4' : 'size-10 [&>svg]:size-5',
        className,
      )}
      style={{
        backgroundColor: `${meta.color}1c`,
        color: meta.color,
        boxShadow: `inset 0 0 0 1px ${meta.color}30`,
      }}
      aria-hidden
    >
      <Icon strokeWidth={2} />
    </span>
  )
}
