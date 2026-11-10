import type { TransactionFilter } from '@/types/api'

export const keys = {
  accounts: {
    all: ['accounts'] as const,
    list: (includeInactive: boolean) => ['accounts', 'list', { includeInactive }] as const,
    detail: (id: string) => ['accounts', 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (includeInactive: boolean) => ['categories', 'list', { includeInactive }] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (filter: TransactionFilter) => ['transactions', 'list', filter] as const,
    detail: (id: string) => ['transactions', 'detail', id] as const,
  },
  budgets: { all: ['budgets'] as const },
  loans: {
    all: ['loans'] as const,
    detail: (id: string) => ['loans', 'detail', id] as const,
  },
  savings: {
    all: ['savings'] as const,
    detail: (id: string) => ['savings', 'detail', id] as const,
  },
  recurring: { all: ['recurring'] as const },
  settings: { all: ['settings'] as const },
  reports: {
    all: ['reports'] as const,
    summary: (from: string, to: string) => ['reports', 'summary', { from, to }] as const,
    categories: (from: string, to: string, type: string) =>
      ['reports', 'categories', { from, to, type }] as const,
    cashFlow: (from: string, to: string, granularity: string) =>
      ['reports', 'cash-flow', { from, to, granularity }] as const,
    budgets: (month: string) => ['reports', 'budgets', { month }] as const,
    merchants: (from: string, to: string, type: string) =>
      ['reports', 'merchants', { from, to, type }] as const,
    accounts: (from: string, to: string) => ['reports', 'accounts', { from, to }] as const,
  },
}

/** Everything that changes when a transaction is written. */
export const transactionDependentKeys = [
  keys.transactions.all,
  keys.accounts.all,
  keys.reports.all,
  keys.loans.all,
  keys.savings.all,
] as const
