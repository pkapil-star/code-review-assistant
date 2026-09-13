import type { ReactNode } from 'react'
import type { IconComponent } from './icons'
import { cn } from '@/lib/cn'

export function Panel({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
}) {
  return <Tag className={cn('panel', className)}>{children}</Tag>
}

/**
 * The header strip of a panel.
 *
 * Panels are used for grouping that means something, so each one gets a title
 * that says what the group is, and optionally an action on the right.
 */
export function PanelHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: IconComponent
  action?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          {Icon && <Icon className="h-[18px] w-[18px] text-ink-muted" aria-hidden />}
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}

export function PanelBody({
  children,
  className,
  flush = false,
}: {
  children: ReactNode
  className?: string
  /** Drop the padding when the body holds a table or a diff that bleeds to the edge. */
  flush?: boolean
}) {
  return <div className={cn(flush ? '' : 'p-5', className)}>{children}</div>
}
