import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Category } from '@/types/api'
import { TransactionForm, defaultValues, toCreateRequest, transactionSchema } from './TransactionForm'

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
    id: 'cat-group-food',
    name: 'Food & Groceries',
    icon: 'utensils',
    color: '#f97316',
    type: 'expense',
    parent_id: null,
    is_active: true,
    is_system: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'cat-food',
    name: 'Food',
    icon: 'utensils',
    color: '#f97316',
    type: 'expense',
    parent_id: 'cat-group-food',
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

/** Opens the category picker, expands the Food & Groceries group and picks `name`. */
async function pickCategory(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Category' }))
  await user.click(await screen.findByRole('button', { name: 'Food & Groceries' }))
  await user.click(await screen.findByRole('radio', { name }))
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
      'xpenses-last-used',
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
      description: ' Lunch ',
    }
    expect(toCreateRequest(v, 'BTN')).toMatchObject({
      amount: 8540,
      category_id: 'cat-food',
      description: 'Lunch',
      status: 'cleared',
    })
    expect(toCreateRequest(v, 'BTN')).not.toHaveProperty('payee')
    const t = { ...v, type: 'transfer' as const, transfer_account_id: 'acc-2' }
    expect(toCreateRequest(t, 'BTN')).toMatchObject({ category_id: null, transfer_account_id: 'acc-2' })
  })

  it('lends to someone new, or repays a loan with interest kept apart', () => {
    const lend = {
      ...defaultValues({ account_id: 'acc-1', type: 'loan_given' }),
      amount: '2000',
      counterparty: ' Pema ',
      category_id: 'cat-food',
    }
    expect(lend.loan_id).toBe('__new')
    expect(toCreateRequest(lend, 'BTN')).toMatchObject({
      type: 'loan_given',
      amount: 200000,
      category_id: null,
      new_loan: { counterparty: 'Pema', due_date: null },
    })
    const repay = {
      ...defaultValues({ account_id: 'acc-1', type: 'loan_repayment', loan_id: 'loan-1' }),
      amount: '500',
      interest: '25.50',
    }
    expect(toCreateRequest(repay, 'BTN')).toMatchObject({ loan_id: 'loan-1', interest: 2550, amount: 50000 })
    expect(toCreateRequest(repay, 'BTN')).not.toHaveProperty('new_loan')
  })

  it('needs a name for a new loan and a loan for a repayment', () => {
    const base = { ...defaultValues({ account_id: 'acc-1' }), amount: '10' }
    const noName = transactionSchema.safeParse({ ...base, type: 'loan_received', loan_id: '__new' })
    expect(noName.success).toBe(false)
    expect(noName.error?.issues.map((i) => i.path[0])).toContain('counterparty')
    const noLoan = transactionSchema.safeParse({
      ...base,
      type: 'loan_repayment_received',
      loan_id: undefined,
    })
    expect(noLoan.error?.issues.map((i) => i.path[0])).toContain('loan_id')
  })

  it('files a refund under the expense category it refunds', () => {
    const v = {
      ...defaultValues({ account_id: 'acc-1', type: 'refund' }),
      amount: '12',
      category_id: 'cat-food',
    }
    expect(toCreateRequest(v, 'BTN')).toMatchObject({ type: 'refund', category_id: 'cat-food', amount: 1200 })
  })
})

describe('TransactionForm', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await screen.findByRole('button', { name: 'Category' }) // data loaded
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(await screen.findByText(/Enter a valid amount/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('pre-selects an account so quick entry never stalls on the picker', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await screen.findByRole('button', { name: 'Category' })
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
    await screen.findByRole('button', { name: 'Category' }) // categories loaded
    await user.type(screen.getByLabelText('Amount'), '85.40')
    await pickCategory(user, 'Food')
    // The field now shows the choice with its group.
    expect(screen.getByRole('button', { name: 'Category' })).toHaveTextContent('Food')
    expect(screen.getByRole('button', { name: 'Category' })).toHaveTextContent('Food & Groceries')
    await user.click(screen.getByRole('combobox', { name: /Account/ }))
    await user.click(await screen.findByRole('option', { name: /^BOB/ }))
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [values] = onSubmit.mock.calls[0] as [Parameters<typeof toCreateRequest>[0]]
    expect(values.amount).toBe('85.40')
    expect(values.account_id).toBe('acc-1')
    expect(values.category_id).toBe('cat-food')
    expect(toCreateRequest(values, 'BTN').amount).toBe(8540)
    expect(JSON.parse(localStorage.getItem('xpenses-last-used') ?? '{}')).toMatchObject({
      expense: { account_id: 'acc-1', category_id: 'cat-food' },
    })
    expect(JSON.parse(localStorage.getItem('xpenses-recent-categories') ?? '{}')).toEqual({
      expense: ['cat-food'],
    })
  })

  it('hides categories and shows the destination account for transfers', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByRole('button', { name: 'Category' })
    await user.click(screen.getByRole('tab', { name: 'Transfer' }))
    expect(screen.queryByRole('button', { name: 'Category' })).not.toBeInTheDocument()
    expect(screen.getByText('To account')).toBeInTheDocument()
  })
})

describe('new category from the picker', () => {
  it('creates a category in place and selects it', async () => {
    const list = [...categories]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/categories') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          name: string
          type: string
          icon: string
          color: string
        }
        const created: Category = {
          id: 'cat-new',
          name: body.name,
          icon: body.icon,
          color: body.color,
          type: body.type as Category['type'],
          parent_id: null,
          is_active: true,
          is_system: false,
          sort_order: 99,
          created_at: '',
          updated_at: '',
        }
        list.push(created)
        return new Response(JSON.stringify({ data: created }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const data = url.includes('/accounts') ? accounts : url.includes('/categories') ? list : []
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const user = userEvent.setup()
    renderForm()
    await screen.findByRole('button', { name: 'Category' })

    await user.click(screen.getByRole('button', { name: 'Category' }))
    await user.click(await screen.findByRole('button', { name: 'New main category' }))
    expect(await screen.findByRole('heading', { name: 'New category' })).toBeInTheDocument()
    // The kind is fixed to the transaction's type, so there is no type switch.
    expect(screen.queryByRole('radio', { name: 'Income' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Name'), 'Momo')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    // Picker and form both close; the field shows the new category.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Category' })).toHaveTextContent('Momo'))
    expect(screen.queryByRole('heading', { name: 'New category' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Choose a category' })).not.toBeInTheDocument()
  })
})

describe('recent categories', () => {
  it('offers recently used categories as one-tap chips', async () => {
    localStorage.setItem('xpenses-recent-categories', JSON.stringify({ expense: ['cat-food'] }))
    const user = userEvent.setup()
    const onSubmit = renderForm()
    const chip = await screen.findByRole('radio', { name: 'Food' })
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-checked', 'true')
    await user.type(screen.getByLabelText('Amount'), '5')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect((onSubmit.mock.calls[0] as [{ category_id?: string }])[0].category_id).toBe('cat-food')
  })
})
