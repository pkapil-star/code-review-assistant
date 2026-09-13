import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  ChevronDown,
  Menu,
  Moon,
  Search,
  Sun,
  TriangleAlert,
  User,
} from 'lucide-react'
import { Github } from '@/components/ui/icons'
import { Badge } from '@/components/ui/Badge'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { ConnectionStatus, PullRequestListItem, Repository } from '@/types'
import type { Theme } from '@/hooks/useTheme'

export function Topbar({
  onOpenNav,
  status,
  repositories,
  selectedRepository,
  onSelectRepository,
  attention,
  theme,
  onToggleTheme,
}: {
  onOpenNav: () => void
  status: ConnectionStatus | null
  repositories: Repository[]
  selectedRepository: string
  onSelectRepository: (fullName: string) => void
  attention: PullRequestListItem[]
  theme: Theme
  onToggleTheme: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/92 px-4 backdrop-blur-md lg:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-md p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <RepositoryPicker
        repositories={repositories}
        selected={selectedRepository}
        onSelect={onSelectRepository}
      />

      <form
        className="relative ml-auto hidden max-w-sm flex-1 md:block"
        onSubmit={(event) => {
          event.preventDefault()
          navigate(`/app/pull-requests?q=${encodeURIComponent(query)}`)
        }}
      >
        <label htmlFor="global-search" className="sr-only">
          Search pull requests
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pull requests, authors, branches"
          className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-line-strong focus:border-accent focus:outline-none"
        />
      </form>

      <div className="ml-auto flex items-center gap-1.5 md:ml-0">
        <GitHubStatus status={status} />
        <NotificationsMenu attention={attention} />

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          title={theme === 'dark' ? 'Light theme (better on a bright projector)' : 'Dark theme'}
          className="rounded-md p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px]" aria-hidden />
          ) : (
            <Moon className="h-[18px] w-[18px]" aria-hidden />
          )}
        </button>

        <ProfileMenu environment={status?.environment ?? 'development'} />
      </div>
    </header>
  )
}

function RepositoryPicker({
  repositories,
  selected,
  onSelect,
}: {
  repositories: Repository[]
  selected: string
  onSelect: (fullName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismissable<HTMLDivElement>(() => setOpen(false))

  const label = selected === 'all' ? 'All repositories' : selected

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 min-w-0 max-w-[15rem] items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-line-strong lg:max-w-xs"
      >
        <Github className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="truncate font-mono text-xs">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-12 z-30 w-72 animate-fade-up rounded-lg border border-line bg-surface p-1.5 shadow-lifted"
        >
          <Option
            label="All repositories"
            active={selected === 'all'}
            onSelect={() => {
              onSelect('all')
              setOpen(false)
            }}
          />
          {repositories.length === 0 && (
            <p className="px-3 py-3 text-sm text-ink-muted">No repositories connected yet.</p>
          )}
          {repositories.map((repository) => (
            <Option
              key={repository.id}
              label={repository.full_name}
              mono
              meta={`${repository.reviews_count} reviews`}
              active={selected === repository.full_name}
              onSelect={() => {
                onSelect(repository.full_name)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Option({
  label,
  meta,
  active,
  mono = false,
  onSelect,
}: {
  label: string
  meta?: string
  active: boolean
  mono?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-accent/12 text-ink' : 'text-ink-soft hover:bg-raised hover:text-ink',
      )}
    >
      <Check className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'opacity-0')} aria-hidden />
      <span className={cn('flex-1 truncate', mono && 'font-mono text-xs')}>{label}</span>
      {meta && <span className="shrink-0 text-xs text-ink-muted">{meta}</span>}
    </button>
  )
}

function GitHubStatus({ status }: { status: ConnectionStatus | null }) {
  if (!status) {
    return <span className="skeleton hidden h-7 w-28 rounded-full sm:block" />
  }

  return status.connected ? (
    <Badge tone="success" size="md" icon={Github} className="hidden sm:inline-flex">
      Connected
    </Badge>
  ) : (
    <a href="/app/settings" className="hidden sm:inline-flex">
      <Badge tone="warning" size="md" icon={TriangleAlert}>
        GitHub not configured
      </Badge>
    </a>
  )
}

function NotificationsMenu({ attention }: { attention: PullRequestListItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useDismissable<HTMLDivElement>(() => setOpen(false))
  const navigate = useNavigate()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications, ${attention.length} pull requests need attention`}
        aria-expanded={open}
        className="relative rounded-md p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {attention.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 font-mono text-[0.625rem] font-bold text-white">
            {attention.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-[22rem] animate-fade-up rounded-lg border border-line bg-surface shadow-lifted">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            Needs attention
          </p>

          {attention.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              Every reviewed pull request is either passing or already decided.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {attention.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      navigate(`/app/pull-requests/${item.id}`)
                    }}
                    className="block w-full px-4 py-3 text-left transition-colors hover:bg-raised"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          item.counts.error > 0 ? 'bg-critical' : 'bg-warning',
                        )}
                        aria-hidden
                      />
                      <span className="truncate text-sm font-semibold text-ink">{item.title}</span>
                    </span>
                    <span className="mt-1 block truncate pl-4 font-mono text-xs text-ink-muted">
                      {item.repository}#{item.number} · {item.counts.error} critical ·{' '}
                      {relativeTime(item.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ProfileMenu({ environment }: { environment: string }) {
  const [open, setOpen] = useState(false)
  const ref = useDismissable<HTMLDivElement>(() => setOpen(false))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-raised text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
      >
        <User className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-64 animate-fade-up rounded-lg border border-line bg-surface p-1.5 shadow-lifted">
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="text-sm font-semibold text-ink">Maintainer</p>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">
              environment: {environment}
            </p>
          </div>
          <p className="px-3 py-3 text-xs leading-relaxed text-ink-muted">
            This build has no user accounts. The service authenticates to GitHub as an App
            installation, not as a person.
          </p>
          <a
            href="/app/settings"
            className="block rounded px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-raised hover:text-ink"
          >
            Integration settings
          </a>
        </div>
      )}
    </div>
  )
}

/** Close a popover when focus or a click lands outside it, or Escape is pressed. */
function useDismissable<T extends HTMLElement>(onDismiss: () => void) {
  const ref = useRef<T>(null)

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onDismiss])

  return ref
}
