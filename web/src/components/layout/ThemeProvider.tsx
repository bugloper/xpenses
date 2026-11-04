import { ThemeProvider as NextThemes, useTheme as useNextTheme } from 'next-themes'
import type { ReactNode } from 'react'

export const THEME_STORAGE_KEY = 'xpensiv-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  )
}

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useNextTheme()
  const current = (resolvedTheme ?? theme ?? 'dark') as 'dark' | 'light'
  return {
    theme: current,
    setTheme: (t: 'dark' | 'light') => setTheme(t),
    toggle: () => setTheme(current === 'dark' ? 'light' : 'dark'),
  }
}
