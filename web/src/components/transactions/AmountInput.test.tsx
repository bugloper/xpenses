import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { parseAmount } from '@/lib/money'
import { AmountInput } from './AmountInput'

function Harness({ allowNegative }: { allowNegative?: boolean }) {
  const [v, setV] = useState('')
  return (
    <>
      <AmountInput value={v} onChange={setV} allowNegative={allowNegative} />
      <output data-testid="minor">{String(parseAmount(v))}</output>
    </>
  )
}

describe('AmountInput', () => {
  it('accepts digits with up to two decimals and parses exactly', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Amount')
    await user.type(input, '85.40')
    expect(input).toHaveValue('85.40')
    expect(screen.getByTestId('minor')).toHaveTextContent('8540')
  })

  it('ignores letters, a second dot and a third decimal', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Amount')
    await user.type(input, '1a2.3.45')
    expect(input).toHaveValue('12.34')
    expect(screen.getByTestId('minor')).toHaveTextContent('1234')
  })

  it('blocks a minus sign unless negatives are allowed', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness />)
    await user.type(screen.getByLabelText('Amount'), '-5')
    expect(screen.getByLabelText('Amount')).toHaveValue('5')
    unmount()
    render(<Harness allowNegative />)
    await user.type(screen.getByLabelText('Amount'), '-5')
    expect(screen.getByLabelText('Amount')).toHaveValue('-5')
    expect(screen.getByTestId('minor')).toHaveTextContent('-500')
  })

  it('uses the decimal keypad on mobile', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Amount')).toHaveAttribute('inputmode', 'decimal')
  })
})
