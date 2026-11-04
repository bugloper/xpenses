import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from './ThemeProvider'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" className={className} onClick={toggle} aria-label="Toggle theme">
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
