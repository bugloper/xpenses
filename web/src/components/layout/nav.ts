import {
  ArrowLeftRight,
  LayoutDashboard,
  PieChart,
  Settings,
  Shapes,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean; adminOnly?: boolean }

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/reports', label: 'Reports', icon: PieChart },
]

export const MORE_NAV: NavItem[] = [
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/categories', label: 'Categories', icon: Shapes },
  { to: '/admin', label: 'Admin', icon: ShieldCheck, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...MORE_NAV]

/** Entries visible to the signed-in user (admin-only ones are dropped for users). */
export function visibleNav(items: NavItem[], isAdmin: boolean): NavItem[] {
  return isAdmin ? items : items.filter((i) => !i.adminOnly)
}
