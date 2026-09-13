/** Navigation and footer for the pages outside the application shell. */

import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowRight, Menu, Moon, Sun, X } from 'lucide-react'
import { Github } from '@/components/ui/icons'
import { Wordmark } from '@/components/layout/Logo'
import { ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useApi } from '@/hooks/useApi'
import { useTheme } from '@/hooks/useTheme'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

const LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/app', label: 'Dashboard' },
  { to: '/app/pull-requests', label: 'Pull requests' },
  { to: '/app/analytics', label: 'Analytics' },
  { to: '/docs', label: 'Documentation' },
]

export function PublicNav() {
  const [open, setOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const { data: status } = useApi(() => api.status(), [])

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center gap-6 px-4 lg:px-8">
        <Link to="/" className="shrink-0 rounded">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  isActive ? 'text-ink' : 'text-ink-muted hover:bg-raised hover:text-ink',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {status && (
            <Badge
              tone={status.connected ? 'success' : 'warning'}
              icon={Github}
              className="hidden sm:inline-flex"
            >
              {status.connected ? 'GitHub connected' : 'GitHub not configured'}
            </Badge>
          )}

          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
            className="rounded-md p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            {theme === 'dark' ? (
              <Sun className="h-[18px] w-[18px]" aria-hidden />
            ) : (
              <Moon className="h-[18px] w-[18px]" aria-hidden />
            )}
          </button>

          <ButtonLink to="/app" variant="primary" className="hidden sm:inline-flex" iconRight={ArrowRight}>
            View dashboard
          </ButtonLink>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            className="rounded-md p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav aria-label="Main" className="border-t border-line bg-surface px-4 py-3 lg:hidden">
          <ul className="space-y-1">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
                      isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:bg-raised',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[96rem] gap-10 px-4 py-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            An automated code review assistant for GitHub pull requests. Static analysis and an AI
            review layer over the same diff, posted back as inline feedback.
          </p>
        </div>

        <FooterColumn
          title="Product"
          links={[
            { to: '/app', label: 'Dashboard' },
            { to: '/app/pull-requests', label: 'Pull requests' },
            { to: '/app/analytics', label: 'Analytics' },
            { to: '/app/repositories', label: 'Repositories' },
          ]}
        />

        <FooterColumn
          title="Reference"
          links={[
            { to: '/docs', label: 'Documentation' },
            { to: '/docs#rules', label: 'Supported checks' },
            { to: '/docs#architecture', label: 'Architecture' },
            { to: '/app/settings', label: 'Configuration' },
          ]}
        />

        <div>
          <p className="label-caps mb-3">Project</p>
          <ul className="space-y-2 text-sm">
            <li className="text-ink-muted">Software Engineering, semester 5</li>
            <li className="text-ink-muted">FastAPI · React · TypeScript</li>
            <li>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer noopener"
                className="link-quiet inline-flex items-center gap-1.5"
              >
                <Github className="h-4 w-4" aria-hidden />
                Source on GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line px-4 py-5 lg:px-8">
        <p className="mx-auto w-full max-w-[96rem] font-mono text-xs text-ink-muted">
          ReviewPilot — Automated Code Review Assistant for GitHub Pull Requests
        </p>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { to: string; label: string }[]
}) {
  return (
    <div>
      <p className="label-caps mb-3">{title}</p>
      <ul className="space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.to + link.label}>
            <Link to={link.to} className="link-quiet">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
