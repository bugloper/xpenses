import {
  BookOpen,
  LayoutGrid,
  LifeBuoy,
  PieChart,
  Settings,
  Shapes,
  ShieldCheck,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  /** Shorter label for the phone's tab bar. */
  short?: string
  icon: LucideIcon
  exact?: boolean
  adminOnly?: boolean
}

/** The working screens, in the order the masthead shows them. */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutGrid, exact: true },
  { to: '/transactions', label: 'Transactions', short: 'Ledger', icon: BookOpen },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/reports', label: 'Reports', icon: PieChart },
]

/** Set-up screens: what the ledger is made of. */
export const SETUP_NAV: NavItem[] = [
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/categories', label: 'Categories', icon: Shapes },
]

export const ACCOUNT_NAV: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Feedback & support', icon: LifeBuoy },
  { to: '/admin', label: 'Admin console', icon: ShieldCheck, adminOnly: true },
]

/** The phone's tab bar shows the first three primary screens; the rest live under More. */
export const TAB_NAV: NavItem[] = PRIMARY_NAV.slice(0, 3)
export const MORE_NAV: NavItem[] = [PRIMARY_NAV[3]!, ...SETUP_NAV, ...ACCOUNT_NAV]

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...SETUP_NAV, ...ACCOUNT_NAV]

/** Entries visible to the signed-in user (admin-only ones are dropped for users). */
export function visibleNav(items: NavItem[], isAdmin: boolean): NavItem[] {
  return isAdmin ? items : items.filter((i) => !i.adminOnly)
}
