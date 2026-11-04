import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Category } from '@/types/api'
import {
  TransactionForm,
  defaultValues,
  parseTags,
  toCreateRequest,
  transactionSchema,
} from './TransactionForm'

const accounts: Account[] = [
  {
    id: 'acc-1',
    name: 'BOB',
    type: 'bank',
    currency: 'BTN',
    opening_balance: 0,
    opening_balance_date: '2026-01-01',
    account_number: '',
    is_active: true,
    current_balance: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'acc-2',
    name: 'Cash',
    type: 'cash',
    currency: 'BTN',
    opening_balance: 0,
    opening_balance_date: '2026-01-01',
    account_number: '',
    is_active: true,
    current_balance: 0,
    created_at: '',
    updated_at: '',
  },
]
const categories: Category[] = [
  {
    id: 'cat-food',
    name: 'Food',
    icon: 'utensils',
    color: '#f97316',
    type: 'expense',
    parent_id: null,
    is_active: true,
    is_system: true,
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'cat-salary',
    name: 'Salary',
    icon: 'briefcase',
    color: '#22c55e',
    type: 'income',
    parent_id: null,
    is_active: true,
    is_system: true,
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
]

function mockApi() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const data = url.includes('/accounts') ? accounts : url.includes('/categories') ? categories : []
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

function renderForm(onSubmit = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TransactionForm
        initial={defaultValues({ account_id: '' })}
        mode="create"
        currency="BTN"
        onSubmit={onSubmit}
      />
    </QueryClientProvider>,
  )
  return onSubmit
}

beforeEach(() => {
  localStorage.clear()
  mockApi()
})
afterEach(() => vi.restoreAllMocks())

describe('transactionSchema', () => {
  it('rejects zero, negative and malformed amounts', () => {
    const base = defaultValues({ account_id: 'acc-1' })
    expect(transactionSchema.safeParse({ ...base, amount: '0' }).success).toBe(false)
    expect(transactionSchema.safeParse({ ...base, amount: '-5' }).success).toBe(false)
    expect(transactionSchema.safeParse({ ...base, amount: '1.234' }).success).toBe(false)
    expect(transactionSchema.safeParse({ ...base, amount: '85.40' }).success).toBe(true)
    expect(transactionSchema.safeParse({ ...base, type: 'adjustment', amount: '-5' }).success).toBe(true)
  })
  it('requires a distinct destination for transfers', () => {
    const base = defaultValues({ account_id: 'acc-1', type: 'transfer' })
    const noDest = transactionSchema.safeParse({ ...base, amount: '10', transfer_account_id: undefined })
    expect(noDest.success).toBe(false)
    const same = transactionSchema.safeParse({ ...base, amount: '10', transfer_account_id: 'acc-1' })
    expect(same.success).toBe(false)
    expect(transactionSchema.safeParse({ ...base, amount: '10', transfer_account_id: 'acc-2' }).success).toBe(
      true,
    )
  })
})

describe('defaultValues', () => {
  it('ignores undefined preset keys and falls back to last-used ids', () => {
    localStorage.setItem(
      'xpensiv-last-used',
      JSON.stringify({ expense: { account_id: 'acc-9', category_id: 'cat-food' } }),
    )
    const v = defaultValues({ type: undefined, account_id: undefined, category_id: undefined })
    expect(v.type).toBe('expense')
    expect(v.account_id).toBe('acc-9')
    expect(v.category_id).toBe('cat-food')
    expect(defaultValues({ type: 'income' }).type).toBe('income')
  })
})

describe('toCreateRequest', () => {
  it('builds the API payload in minor units and strips category for transfers', () => {
    const v = {
      ...defaultValues({ account_id: 'acc-1' }),
      amount: '85.40',
      category_id: 'cat-food',
      tags: 'a, b, a',
      payee: ' Cafe ',
    }
    expect(toCreateRequest(v, 'BTN')).toMatchObject({
      amount: 8540,
      category_id: 'cat-food',
      tags: ['a', 'b'],
      payee: 'Cafe',
      status: 'cleared',
    })
    const t = { ...v, type: 'transfer' as const, transfer_account_id: 'acc-2' }
    expect(toCreateRequest(t, 'BTN')).toMatchObject({ category_id: null, transfer_account_id: 'acc-2' })
    expect(parseTags(undefined)).toEqual([])
  })
})

describe('TransactionForm', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await screen.findByText('Food') // data loaded
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(await screen.findByText(/Enter a valid amount/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('pre-selects an account so quick entry never stalls on the picker', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await screen.findByText('Food')
    // No last-used account: the first active account (bank first) is chosen.
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Account/ })).toHaveTextContent('BOB'))
    await user.type(screen.getByLabelText('Amount'), '12')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Select an account')).not.toBeInTheDocument()
  })

  it('submits parsed values and remembers last-used account + category', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await screen.findByText('Food') // categories loaded
    await user.type(screen.getByLabelText('Amount'), '85.40')
    await user.click(screen.getByRole('radio', { name: /Food/ }))
    await user.click(screen.getByRole('combobox', { name: /Account/ }))
    await user.click(await screen.findByRole('option', { name: 'BOB' }))
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [values] = onSubmit.mock.calls[0] as [Parameters<typeof toCreateRequest>[0]]
    expect(values.amount).toBe('85.40')
    expect(values.account_id).toBe('acc-1')
    expect(values.category_id).toBe('cat-food')
    expect(toCreateRequest(values, 'BTN').amount).toBe(8540)
    expect(JSON.parse(localStorage.getItem('xpensiv-last-used') ?? '{}')).toMatchObject({
      expense: { account_id: 'acc-1', category_id: 'cat-food' },
    })
  })

  it('hides categories and shows the destination account for transfers', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByText('Food')
    await user.click(screen.getByRole('tab', { name: 'Transfer' }))
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
    expect(screen.getByText('To account')).toBeInTheDocument()
  })
})
