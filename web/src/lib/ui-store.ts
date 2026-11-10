// Tiny external store for app-level UI state (sheets opened from anywhere).
import { useSyncExternalStore } from 'react'
import type { TransactionType } from '@/types/api'

export type AddPreset = {
  type?: TransactionType
  account_id?: string
  transfer_account_id?: string
  category_id?: string
  /** The loan to lend more on, borrow more on, or repay. */
  loan_id?: string
  /** When set, the sheet edits this transaction instead of creating. */
  editId?: string
  /** Revise a failed offline item. */
  pendingClientId?: string
}

type UIState = {
  addOpen: boolean
  addPreset: AddPreset | null
  moreOpen: boolean
  pendingOpen: boolean
  /** The logout confirmation / unsynced-items dialog. */
  logoutOpen: boolean
}

let state: UIState = {
  addOpen: false,
  addPreset: null,
  moreOpen: false,
  pendingOpen: false,
  logoutOpen: false,
}
const listeners = new Set<() => void>()

function set(patch: Partial<UIState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export const uiStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get: () => state,
  openAdd(preset: AddPreset | null = null) {
    set({ addOpen: true, addPreset: preset, moreOpen: false })
  },
  closeAdd() {
    set({ addOpen: false, addPreset: null })
  },
  setMore(open: boolean) {
    set({ moreOpen: open })
  },
  setPending(open: boolean) {
    set({ pendingOpen: open })
  },
  /** Starts the logout flow (checks for unsynced items first, see LogoutDialog). */
  requestLogout() {
    set({ logoutOpen: true, moreOpen: false })
  },
  setLogout(open: boolean) {
    set({ logoutOpen: open })
  },
}

export function useUIStore(): UIState {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get, uiStore.get)
}
