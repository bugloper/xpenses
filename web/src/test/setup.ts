import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom lacks matchMedia / ResizeObserver used by Radix + Recharts.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
if (!('ResizeObserver' in window)) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', { value: RO })
}

// Radix Select / Popover rely on pointer capture + scrollIntoView, missing in jsdom.
for (const name of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
  if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: () => false })
}
if (!('scrollIntoView' in Element.prototype))
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {} })
