import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStore, parseRegisterSearch } from '@/lib/auth'
import { RegisterForm } from './RegisterForm'

function renderForm(inviteToken?: string) {
  const onSuccess = vi.fn()
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <RegisterForm inviteToken={inviteToken} onSuccess={onSuccess} />
    </QueryClientProvider>,
  )
  return onSuccess
}

async function fill() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Name'), 'Nima')
  await user.type(screen.getByLabelText('Email'), 'nima@example.com')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery')
  await user.type(screen.getByLabelText('Confirm password'), 'correct horse battery')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

function mockError(status: number, code: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: { code, message: code } }), { status }),
  )
}

beforeEach(() => {
  localStorage.clear()
  authStore.setUser(null)
})
afterEach(() => vi.restoreAllMocks())

describe('RegisterForm', () => {
  it('forwards the invite token from ?invite= as invite_token', async () => {
    const token = parseRegisterSearch({ invite: 'tok-123' }).invite
    const me = {
      id: 'u2',
      name: 'Nima',
      email: 'nima@example.com',
      role: 'user',
      is_active: true,
      created_at: '',
      last_login_at: null,
    }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: me }), { status: 201 }))
    const onSuccess = renderForm(token)
    await fill()
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('/api/v1/auth/register')
    expect(JSON.parse(init?.body as string)).toEqual({
      name: 'Nima',
      email: 'nima@example.com',
      password: 'correct horse battery',
      invite_token: 'tok-123',
    })
  })

  it('omits invite_token without an invite', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: { id: 'u2', role: 'user' } }), { status: 201 }))
    renderForm()
    await fill()
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string)).not.toHaveProperty('invite_token')
  })

  it('requires matching passwords of at least 10 characters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderForm()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'Nima')
    await user.type(screen.getByLabelText('Email'), 'nima@example.com')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'different')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Use at least 10 characters')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  const codes: Array<[number, string, RegExp]> = [
    [403, 'registration_closed', /Registration is closed/],
    [400, 'invalid_invite', /invite link is invalid/],
    [409, 'email_taken', /already exists/],
  ]
  it.each(codes)('%i %s shows a precise message', async (status, code, expected) => {
    mockError(status, code)
    renderForm('tok')
    await fill()
    expect(await screen.findByText(expected)).toBeInTheDocument()
  })
})
