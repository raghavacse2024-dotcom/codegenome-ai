import { useState, useEffect, useCallback } from 'react'

export type ThemeId = 'dark-obsidian' | 'clean-light'

export interface ThemeDefinition {
  id: ThemeId
  name: string
  shortName: string
  description: string
  emoji: string
  accent: string
  previewBg: string
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'dark-obsidian',
    name: 'Dark Mode',
    shortName: 'Dark',
    description: 'Cybernetic dark obsidian mode',
    emoji: '🌙',
    accent: '#7df3c3',
    previewBg: '#050b14',
  },
  {
    id: 'clean-light',
    name: 'Light Mode',
    shortName: 'Light',
    description: 'Clean high-contrast light mode',
    emoji: '☀️',
    accent: '#0284c7',
    previewBg: '#f8fafc',
  },
]

const STORAGE_KEY = 'codegenome-theme'

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null
      if (saved && THEMES.some((t) => t.id === saved)) {
        return saved
      }
    } catch {
      // Fallback if storage access is restricted
    }
    return 'dark-obsidian'
  })

  const applyTheme = useCallback((newTheme: ThemeId) => {
    document.documentElement.setAttribute('data-theme', newTheme)
    document.body.setAttribute('data-theme', newTheme)
    try {
      localStorage.setItem(STORAGE_KEY, newTheme)
    } catch {
      // Ignore storage errors
    }
  }, [])

  const setTheme = useCallback(
    (newTheme: ThemeId) => {
      setThemeState(newTheme)
      applyTheme(newTheme)
    },
    [applyTheme]
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme, applyTheme])

  return {
    theme,
    setTheme,
    themes: THEMES,
    currentThemeConfig: THEMES.find((t) => t.id === theme) || THEMES[0],
  }
}
