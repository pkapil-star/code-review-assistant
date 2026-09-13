import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  BarChart3,
  FolderGit2,
  GaugeCircle,
  GitPullRequest,
  Settings as SettingsIcon,
  ShieldCheck,
  X,
} from 'lucide-react'
import type { IconComponent } from '@/components/ui/icons'
import { Wordmark } from './Logo'
import { cn } from '@/lib/cn'
import type { ConnectionStatus } from '@/types'

interface NavItem {
  to: string
  label: string
  icon: IconComponent
  end?: boolean
  badge?: number
}

export function Sidebar({
  open,
  onClose,
  needsAttention,
  status,
}: {
  open: boolean
  onClose: () => void
  needsAttention: number
  status: ConnectionStatus | null
}) {
  const primary: NavItem[] = [
    { to: '/app', label: 'Dashboard', icon: GaugeCircle, end: true },
    { to: '/app/pull-requests', label: 'Pull requests', icon: GitPullRequest, badge: needsAttention },
    { to: '/app/repositories', label: 'Repositories', icon: FolderGit2 },
    { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  ]

  const secondary: NavItem[] = [
    { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
    { to: '/docs', label: 'Documentation', icon: BookOpen },
  ]

  return (
    <>
      {/* The scrim only exists below lg, where the sidebar overlays the content. */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[rgb(2_6_16/0.6)] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-line bg-surface',
          'transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Primary"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <NavLink to="/" className="min-w-0 rounded">
            <Wordmark />
          </NavLink>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded p-1.5 text-ink-muted hover:bg-raised hover:text-ink lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="label-caps px-3 pb-2">Review</p>
          <ul className="space-y-1">
            {primary.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} onNavigate={onClose} />
              </li>
            ))}
          </ul>

          <p className="label-caps px-3 pb-2 pt-7">Configure</p>
          <ul className="space-y-1">
            {secondary.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} onNavigate={onClose} />
              </li>
            ))}
          </ul>
        </nav>

        <PipelineFooter status={status} />
      </aside>
    </>
  )
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { to, label, icon: Icon, end, badge } = item

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
          isActive
            ? 'bg-accent/12 text-ink shadow-[inset_2px_0_0_0_rgb(var(--accent))]'
            : 'text-ink-muted hover:bg-raised hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-[18px] w-[18px]', isActive && 'text-accent')} aria-hidden />
          <span className="flex-1 truncate">{label}</span>
          {badge ? (
            <span className="rounded-full bg-critical/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-critical">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

/** The pipeline's own health, kept in view rather than buried in settings. */
function PipelineFooter({ status }: { status: ConnectionStatus | null }) {
  if (!status) {
    return <div className="h-[4.5rem] shrink-0 border-t border-line" />
  }

  const rows = [
    {
      label: 'Workers',
      value: status.workers_running ? 'running' : 'stopped',
      ok: status.workers_running,
    },
    { label: 'Queue', value: status.queue_backend, ok: true },
    { label: 'AI layer', value: status.ai_provider, ok: status.ai_configured },
  ]

  return (
    <div className="shrink-0 border-t border-line px-4 py-4">
      <p className="label-caps mb-2.5 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Pipeline
      </p>
      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
            <dt className="text-ink-muted">{row.label}</dt>
            <dd className="flex items-center gap-1.5 font-mono text-ink-soft">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  row.ok ? 'bg-success' : 'bg-warning',
                )}
                aria-hidden
              />
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
