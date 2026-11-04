import { useMemo, useState } from 'react'
import { AccountIcon } from '@/components/common/AccountIcon'
import { CategoryField } from '@/components/categories/CategoryField'
import { CategoryIcon } from '@/components/common/CategoryIcon'
import { Money } from '@/components/common/Money'
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet'
import { Segmented } from '@/components/common/Segmented'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatShortDate } from '@/lib/dates'
import { bankSide, cleanDescription, rankManualCandidates } from '@/lib/reconciliation'
import { transactionTitle } from '@/lib/transactions'
import { cn } from '@/lib/utils'
import type {
  Account,
  BankLine,
  Category,
  CreateFromBankRequest,
  ManualLine,
  MarkTransferRequest,
} from '@/types/api'

function LineSummary({ line, currency }: { line: BankLine; currency: string }) {
  const side = bankSide(line)
  return (
    <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{line.description || '(no description)'}</p>
        <p className="text-muted-foreground text-xs">
          {formatShortDate(line.transaction_date)}
          {line.reference && ` · ${line.reference}`}
        </p>
      </div>
      <Money
        minor={side.isDebit ? -side.amount : side.amount}
        currency={currency}
        tone="auto"
        sign="always"
        className="shrink-0 font-semibold"
      />
    </div>
  )
}

export function IgnoreDialog({
  open,
  onOpenChange,
  line,
  currency,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  line: BankLine | null
  currency: string
  busy: boolean
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setNote('')
      }}
      title="Ignore bank line"
      description="Bank charges, interest or anything you do not track. You can un-ignore it later."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(note.trim())} disabled={busy || !line}>
            Ignore
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {line && <LineSummary line={line} currency={currency} />}
        <Field>
          <FieldLabel htmlFor="ignore-note">Note (optional)</FieldLabel>
          <Textarea
            id="ignore-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. monthly SMS charge"
          />
        </Field>
      </div>
    </ResponsiveSheet>
  )
}

export function MarkTransferDialog({
  open,
  onOpenChange,
  line,
  transfers,
  accounts,
  accountId,
  currency,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  line: BankLine | null
  /** Unmatched manual transfers touching the statement account. */
  transfers: ManualLine[]
  accounts: Account[]
  accountId: string
  currency: string
  busy: boolean
  onConfirm: (body: MarkTransferRequest) => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(transfers.length > 0 ? 'existing' : 'new')
  const [otherAccount, setOtherAccount] = useState('')
  const ranked = useMemo(() => (line ? rankManualCandidates(line, transfers) : []), [line, transfers])
  const side = line ? bankSide(line) : null
  const others = accounts.filter((a) => a.id !== accountId && a.is_active)
  const statementAccount = accounts.find((a) => a.id === accountId)
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setOtherAccount('')
          setMode(transfers.length > 0 ? 'existing' : 'new')
        }
      }}
      title="Mark as transfer"
      description="Money moved between your own accounts is never income or expense."
      desktopWidth="sm:max-w-lg"
      footer={
        mode === 'new' ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !line || !otherAccount}
              onClick={() =>
                line && onConfirm({ bank_transaction_id: line.id, transfer_account_id: otherAccount })
              }
            >
              Create transfer
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {line && <LineSummary line={line} currency={currency} />}
        <Segmented
          aria-label="Transfer source"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'existing',
              label: `Existing transfer${transfers.length ? ` (${transfers.length})` : ''}`,
            },
            { value: 'new', label: 'Create new' },
          ]}
        />
        {mode === 'existing' ? (
          ranked.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No unmatched transfers on this account in the statement window. Create one instead.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {ranked.map((c) => (
                <li
                  key={c.tx.id}
                  className={cn(
                    'bg-muted/40 flex items-center gap-3 rounded-xl p-3',
                    !c.sameDirection && 'opacity-60',
                  )}
                >
                  <CategoryIcon kind="transfer" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{transactionTitle(c.tx)}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatShortDate(c.tx.transaction_date)} ·{' '}
                      {c.dateDiff === 0 ? 'same day' : `${c.dateDiff}d apart`}
                      {!c.sameAmount && (
                        <>
                          {' '}
                          · diff <Money minor={c.amountDiff} currency={currency} sign="always" />
                        </>
                      )}
                      {!c.sameDirection && ' · opposite direction'}
                    </p>
                  </div>
                  <Money minor={c.tx.amount} currency={c.tx.currency} className="text-sm font-semibold" />
                  <Button
                    type="button"
                    size="xs"
                    disabled={busy || !c.sameDirection}
                    onClick={() =>
                      line && onConfirm({ bank_transaction_id: line.id, transaction_id: c.tx.id })
                    }
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <Field>
            <FieldLabel htmlFor="transfer-other">
              {side?.isDebit ? 'Money went to' : 'Money came from'}
            </FieldLabel>
            <Select value={otherAccount} onValueChange={setOtherAccount}>
              <SelectTrigger id="transfer-other" className="w-full">
                <SelectValue placeholder="Select the other account" />
              </SelectTrigger>
              <SelectContent>
                {others.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <AccountIcon type={a.type} size="sm" className="size-5 rounded-md [&>svg]:size-3" />
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {side && statementAccount
                ? side.isDebit
                  ? `A transfer of this amount from ${statementAccount.name} to the chosen account is created and linked.`
                  : `A transfer of this amount from the chosen account to ${statementAccount.name} is created and linked.`
                : 'A transfer transaction is created and linked to this bank line.'}
            </FieldDescription>
          </Field>
        )}
      </div>
    </ResponsiveSheet>
  )
}

export function CreateFromBankDialog({
  open,
  onOpenChange,
  line,
  categories,
  currency,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  line: BankLine | null
  categories: Category[]
  currency: string
  busy: boolean
  onConfirm: (body: CreateFromBankRequest) => void
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Create transaction"
      description="Records this bank line as a transaction and matches it."
      desktopWidth="sm:max-w-lg"
    >
      {open && line && (
        <CreateForm
          key={line.id}
          line={line}
          categories={categories}
          currency={currency}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </ResponsiveSheet>
  )
}

function CreateForm({
  line,
  categories,
  currency,
  busy,
  onConfirm,
  onCancel,
}: {
  line: BankLine
  categories: Category[]
  currency: string
  busy: boolean
  onConfirm: (body: CreateFromBankRequest) => void
  onCancel: () => void
}) {
  const side = bankSide(line)
  const wanted = side.isDebit ? 'expense' : 'income'
  const [categoryId, setCategoryId] = useState<string>('')
  const [payee, setPayee] = useState(cleanDescription(line.description))
  const [description, setDescription] = useState(line.description.trim())
  const [notes, setNotes] = useState('')
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        onConfirm({
          bank_transaction_id: line.id,
          category_id: categoryId || undefined,
          payee: payee.trim(),
          description: description.trim(),
          notes: notes.trim(),
        })
      }}
    >
      <LineSummary line={line} currency={currency} />
      <p className="text-muted-foreground text-xs">
        Creates {wanted === 'expense' ? 'an expense' : 'an income'} of{' '}
        <Money minor={side.amount} currency={currency} className="text-foreground" /> on{' '}
        {formatShortDate(line.transaction_date)}.
      </p>
      <Field>
        <FieldLabel htmlFor="create-category">Category</FieldLabel>
        <CategoryField
          id="create-category"
          categories={categories}
          type={wanted}
          value={categoryId || undefined}
          onChange={(id) => setCategoryId(id ?? '')}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="create-payee">Payee</FieldLabel>
        <Input id="create-payee" value={payee} maxLength={200} onChange={(e) => setPayee(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="create-description">Description</FieldLabel>
        <Input
          id="create-description"
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="create-notes">Notes</FieldLabel>
        <Textarea
          id="create-notes"
          value={notes}
          maxLength={2000}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Create & match
        </Button>
      </div>
    </form>
  )
}
