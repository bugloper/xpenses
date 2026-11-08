import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStore } from '@/lib/auth'
import { LoginForm } from './LoginForm'

function renderForm() {
  const onSuccess = vi.fn()
  const onSetupRequired = vi.fn()
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <LoginForm onSuccess={onSuccess} onSetupRequired={onSetupRequired} />
    </QueryClientProvider>,
  )
  return { onSuccess, onSetupRequired }
}

function mockError(
  status: number,
  code: string,
  details?: Record<string, string>,
  headers?: Record<string, string>,
) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: { code, message: code, details } }), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  )
}

async function submit() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'nima@example.com')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

beforeEach(() => {
  localStorage.clear()
  authStore.setUser(null)
})
afterEach(() => vi.restoreAllMocks())

describe('LoginForm', () => {
  it('validates before submitting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your email')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts email + password and reports the user on success', async () => {
    const me = {
      id: 'u1',
      name: 'N',
      email: 'nima@example.com',
      role: 'user',
      is_active: true,
      created_at: '',
      last_login_at: null,
      avatar_updated_at: null,
      access_until: '2099-01-01',
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: me }), { status: 200 }))
    const { onSuccess } = renderForm()
    await submit()
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' })))
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('/api/v1/auth/login')
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'nima@example.com',
      password: 'correct horse battery',
    })
    expect(authStore.get().user?.id).toBe('u1')
  })

  const codes: Array<[number, string, RegExp]> = [
    [401, 'invalid_credentials', /Incorrect email or password/],
    [403, 'account_disabled', /disabled/],
    [429, 'too_many_attempts', /Too many attempts/],
  ]
  it.each(codes)('%i %s shows a precise message', async (status, code, expected) => {
    mockError(status, code)
    const { onSuccess } = renderForm()
    await submit()
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('too_many_attempts shows the retry seconds from error.details and blocks the button', async () => {
    mockError(429, 'too_many_attempts', { retry_after: '45' })
    renderForm()
    await submit()
    expect(await screen.findByText('Too many attempts. Try again in 45 seconds.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })

  it('too_many_attempts falls back to the Retry-After header', async () => {
    mockError(429, 'too_many_attempts', undefined, { 'Retry-After': '12' })
    renderForm()
    await submit()
    expect(await screen.findByText('Too many attempts. Try again in 12 seconds.')).toBeInTheDocument()
  })

  it('setup_required hands over to the setup page', async () => {
    mockError(403, 'setup_required')
    const { onSetupRequired } = renderForm()
    await submit()
    await waitFor(() => expect(onSetupRequired).toHaveBeenCalledTimes(1))
  })

  it('network failure says offline', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    renderForm()
    await submit()
    expect(await screen.findByText(/offline/)).toBeInTheDocument()
  })
})
