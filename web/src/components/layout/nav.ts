import {
  ArrowLeftRight,
  FileText,
  LayoutDashboard,
  PieChart,
  Settings,
  Shapes,
  Wallet,
  Scale,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean }

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/reports', label: 'Reports', icon: PieChart },
]

export const MORE_NAV: NavItem[] = [
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/categories', label: 'Categories', icon: Shapes },
  { to: '/statements', label: 'Bank Statements', icon: FileText },
  { to: '/reconciliation', label: 'Reconciliation', icon: Scale },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...MORE_NAV]
