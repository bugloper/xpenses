import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import type { Account } from '@/types/api'
import { UploadStep } from './UploadStep'

const account: Account = {
  id: 'acc1',
  name: 'BOB Savings',
  type: 'savings',
  currency: 'BTN',
  opening_balance: 0,
  opening_balance_date: '2026-01-01',
  account_number: '',
  is_active: true,
  current_balance: 0,
  created_at: '',
  updated_at: '',
}

function pdf(name = 'statement.pdf', size = 1024): File {
  const f = new File([new Uint8Array(size)], name, { type: 'application/pdf' })
  return f
}

async function setup(parse: (v: unknown) => Promise<never>) {
  const onParsed = vi.fn()
  const user = userEvent.setup()
  render(<UploadStep accounts={[account]} parse={parse} onParsed={onParsed} />)
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  await user.upload(input, pdf())
  await user.type(screen.getByLabelText('PDF password'), '0101')
  await user.click(screen.getByRole('button', { name: /parse statement/i }))
  return { user, onParsed }
}

describe('UploadStep error mapping', () => {
  it('shows a wrong password inline on the password field and stays on the step', async () => {
    const parse = vi.fn().mockRejectedValue(
      new ApiError({ status: 400, code: 'pdf_password_incorrect', message: 'the password did not open this statement' }),
    )
    const { onParsed } = await setup(parse)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/password did not open/i)
    expect(screen.getByLabelText('PDF password')).toHaveAttribute('aria-invalid', 'true')
    expect(onParsed).not.toHaveBeenCalled()
    // Still on the upload form.
    expect(screen.getByRole('button', { name: /parse statement/i })).toBeInTheDocument()
  })

  it('explains a scanned PDF (OCR not supported)', async () => {
    const parse = vi.fn().mockRejectedValue(new ApiError({ status: 422, code: 'pdf_no_text', message: 'no text' }))
    await setup(parse)
    expect(await screen.findByRole('alert')).toHaveTextContent(/scanned PDF/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/OCR/)
    expect(screen.getByLabelText('PDF password')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('explains an unrecognised layout and that nothing was imported', async () => {
    const parse = vi.fn().mockRejectedValue(new ApiError({ status: 422, code: 'pdf_unrecognised', message: 'x' }))
    await setup(parse)
    expect(await screen.findByRole('alert')).toHaveTextContent(/layout not recognised/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing was imported/i)
  })

  it('rejects an oversized file before uploading', async () => {
    const parse = vi.fn()
    const user = userEvent.setup()
    render(<UploadStep accounts={[account]} parse={parse} onParsed={vi.fn()} />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    const big = { name: 'big.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' } as File
    // user.upload copies File objects; stub the FileList directly for a fake size.
    Object.defineProperty(input, 'files', { value: [big], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/limit is 10 MB/))
    await user.click(screen.getByRole('button', { name: /parse statement/i }))
    expect(parse).not.toHaveBeenCalled()
  })

  it('sends the password only inside the parse call and passes the preview up', async () => {
    const preview = { upload_token: 't', transactions: [] }
    const parse = vi.fn().mockResolvedValue(preview)
    const { onParsed } = await setup(parse as never)
    await waitFor(() => expect(onParsed).toHaveBeenCalledTimes(1))
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'acc1', password: '0101' }))
    expect(onParsed.mock.calls[0]![0]).toBe(preview)
  })
})
