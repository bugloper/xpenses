import { createRouter } from '@tanstack/react-router'
import { appRoute, rootRoute } from './routes/__root'
import { dashboardRoute } from './routes/index'
import { transactionsRoute } from './routes/transactions'
import { transactionDetailRoute } from './routes/transaction-detail'
import { addRoute } from './routes/add'
import { accountsRoute } from './routes/accounts'
import { accountDetailRoute } from './routes/account-detail'
import { categoriesRoute } from './routes/categories'
import { budgetsRoute } from './routes/budgets'
import { settingsRoute } from './routes/settings'
import { reportsRoute } from './routes/reports'
import { adminRoute } from './routes/admin'
import { helpRoute } from './routes/help'
import {
  authLayoutRoute,
  expiredRoute,
  loginRoute,
  registerRoute,
  resetPasswordRoute,
  setupRoute,
} from './routes/auth'

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    dashboardRoute,
    transactionsRoute,
    transactionDetailRoute,
    addRoute,
    accountsRoute,
    accountDetailRoute,
    categoriesRoute,
    budgetsRoute,
    settingsRoute,
    reportsRoute,
    adminRoute,
    helpRoute,
  ]),
  authLayoutRoute.addChildren([loginRoute, setupRoute, registerRoute, resetPasswordRoute, expiredRoute]),
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
