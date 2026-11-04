// Tiny external store for app-level UI state (sheets opened from anywhere).
import { useSyncExternalStore } from 'react'
import type { TransactionType } from '@/types/api'

export type AddPreset = {
  type?: TransactionType
  account_id?: string
  transfer_account_id?: string
  category_id?: string
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
}

let state: UIState = { addOpen: false, addPreset: null, moreOpen: false, pendingOpen: false }
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
}

export function useUIStore(): UIState {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get, uiStore.get)
}
