'use client'

import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type Theme } from '@/store/theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore()

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800',
        className
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          className={cn(
            'flex items-center justify-center p-1.5 rounded-md transition-colors',
            theme === value
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
          )}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}
