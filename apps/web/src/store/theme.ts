import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(theme: Theme) {
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', isDark)
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
}))

// Keep the applied class in sync with OS changes while the user is on "system".
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().theme === 'system') applyTheme('system')
  })
}
