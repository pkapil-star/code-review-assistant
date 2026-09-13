/**
 * The authenticated application frame.
 *
 * It owns three pieces of state that every page reads: the connection status,
 * the repository filter in the top bar, and the list of pull requests needing
 * attention. Fetching them once here keeps every page from repeating the call.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useApi } from '@/hooks/useApi'
import { useTheme } from '@/hooks/useTheme'
import { api } from '@/lib/api'
import type { ConnectionStatus, Repository } from '@/types'

interface ShellContextValue {
  status: ConnectionStatus | null
  repositories: Repository[]
  /** The repository selected in the top bar, or "all". */
  repositoryFilter: string
  setRepositoryFilter: (value: string) => void
  refreshShell: () => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext)

  if (!context) {
    throw new Error('useShell must be used inside the AppShell')
  }

  return context
}

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const [repositoryFilter, setRepositoryFilter] = useState('all')
  const { theme, toggle } = useTheme()

  const status = useApi(() => api.status(), [])
  const repositories = useApi(() => api.repositories(), [])
  const attention = useApi(
    () => api.pullRequests({ review_status: 'critical' }),
    [],
  )

  const refreshShell = useCallback(() => {
    status.refetch()
    repositories.refetch()
    attention.refetch()
  }, [status, repositories, attention])

  const pending = useMemo(
    () => (attention.data ?? []).filter((item) => item.decision === null),
    [attention.data],
  )

  const value = useMemo<ShellContextValue>(
    () => ({
      status: status.data,
      repositories: repositories.data ?? [],
      repositoryFilter,
      setRepositoryFilter,
      refreshShell,
    }),
    [status.data, repositories.data, repositoryFilter, refreshShell],
  )

  return (
    <ShellContext.Provider value={value}>
      <div className="min-h-screen bg-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-ink"
        >
          Skip to content
        </a>

        <Sidebar
          open={navOpen}
          onClose={() => setNavOpen(false)}
          needsAttention={pending.length}
          status={status.data}
        />

        <div className="lg:pl-[17rem]">
          <Topbar
            onOpenNav={() => setNavOpen(true)}
            status={status.data}
            repositories={repositories.data ?? []}
            selectedRepository={repositoryFilter}
            onSelectRepository={setRepositoryFilter}
            attention={pending}
            theme={theme}
            onToggleTheme={toggle}
          />

          <main id="main" className="mx-auto w-full max-w-[112rem] px-4 py-7 lg:px-8 lg:py-9">
            <Outlet />
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  )
}
