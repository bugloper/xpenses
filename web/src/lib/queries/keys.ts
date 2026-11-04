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
  payees: { all: ['payees'] as const },
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
    reconciliation: (statementId: string) => ['reports', 'reconciliation', { statementId }] as const,
  },
  reconciliation: {
    all: ['reconciliation'] as const,
    overview: ['reconciliation', 'overview'] as const,
    workspace: (statementId: string) => ['reconciliation', 'workspace', statementId] as const,
  },
  statements: {
    all: ['statements'] as const,
    list: ['statements', 'list'] as const,
    detail: (id: string) => ['statements', 'detail', id] as const,
    transactions: (id: string) => ['statements', 'transactions', id] as const,
  },
}

/** Everything that changes when a transaction is written. */
export const transactionDependentKeys = [
  keys.transactions.all,
  keys.payees.all,
  keys.accounts.all,
  keys.reports.all,
  keys.reconciliation.all,
] as const

/** Everything that changes when a reconciliation or statement is written. */
export const reconciliationDependentKeys = [
  keys.reconciliation.all,
  keys.statements.all,
  keys.transactions.all,
  keys.accounts.all,
  keys.reports.all,
] as const
