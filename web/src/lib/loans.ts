import type { Loan } from '@/types/api'

/** What the loans add up to: owed to the user, and owed by the user. */
export function loanTotals(loans: Loan[]) {
  const t = { owedToYou: 0, youOwe: 0, lent: 0, borrowed: 0, openGiven: 0, openReceived: 0 }
  for (const l of loans) {
    if (l.direction === 'given') {
      t.lent += l.principal
      if (l.outstanding > 0) {
        t.owedToYou += l.outstanding
        t.openGiven++
      }
    } else {
      t.borrowed += l.principal
      if (l.outstanding > 0) {
        t.youOwe += l.outstanding
        t.openReceived++
      }
    }
  }
  return t
}
