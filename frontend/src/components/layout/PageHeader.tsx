import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: { label: string; to?: string }[]
}) {
  return (
    <header className="mb-7">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />}
                {crumb.to ? (
                  <Link to={crumb.to} className="link-quiet">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-ink-soft">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <p className="label-caps mb-1.5">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-2 text-base leading-relaxed text-ink-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  )
}
