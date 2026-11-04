import { createRouter } from '@tanstack/react-router'
import { rootRoute } from './routes/__root'
import { dashboardRoute } from './routes/index'
import { transactionsRoute } from './routes/transactions'
import { transactionDetailRoute } from './routes/transaction-detail'
import { addRoute } from './routes/add'
import { accountsRoute } from './routes/accounts'
import { accountDetailRoute } from './routes/account-detail'
import { categoriesRoute } from './routes/categories'
import { settingsRoute } from './routes/settings'
import { statementsRoute, statementDetailRoute } from './routes/statements'
import { reconciliationRoute, reconciliationWorkspaceRoute } from './routes/reconciliation'
import { reportsRoute } from './routes/reports'

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  transactionsRoute,
  transactionDetailRoute,
  addRoute,
  accountsRoute,
  accountDetailRoute,
  categoriesRoute,
  settingsRoute,
  statementsRoute,
  statementDetailRoute,
  reconciliationRoute,
  reconciliationWorkspaceRoute,
  reportsRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
