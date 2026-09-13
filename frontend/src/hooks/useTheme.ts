/**
 * Theme switching.
 *
 * The dark shell is the default because it is what the product is designed
 * around. Light exists for one reason: a projector in a bright room washes out
 * a dark screen, and the demo has to survive that.
 */

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'reviewpilot.theme'

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private windows and blocked site data both throw here. Fall through.
  }

  return 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Not being able to remember the choice is not worth breaking the page over.
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle, setTheme }
}
