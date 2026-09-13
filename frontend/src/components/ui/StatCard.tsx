/**
 * The headline number panel.
 *
 * The figure is the largest thing in the card on purpose: these are the numbers
 * a room full of people reads from a distance, so the label is small and the
 * value is not.
 */

import type { ReactNode } from 'react'
import type { IconComponent } from './icons'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'critical'

const ICON_TONE: Record<Tone, string> = {
  neutral: 'border-line-strong bg-raised text-ink-muted',
  accent: 'border-accent/35 bg-accent/12 text-accent',
  success: 'border-success/35 bg-success/12 text-success',
  warning: 'border-warning/35 bg-warning/12 text-warning',
  critical: 'border-critical/40 bg-critical/12 text-critical',
}

const VALUE_TONE: Record<Tone, string> = {
  neutral: 'text-ink',
  accent: 'text-ink',
  success: 'text-success',
  warning: 'text-warning',
  critical: 'text-critical',
}

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'neutral',
  hint,
  to,
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  icon: IconComponent
  tone?: Tone
  hint?: ReactNode
  to?: string
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="label-caps">{label}</p>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
            ICON_TONE[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className={cn('stat-figure', VALUE_TONE[tone])}>{value}</span>
        {unit && <span className="font-mono text-base text-ink-muted">{unit}</span>}
      </p>

      {hint && <p className="mt-2 text-sm text-ink-muted">{hint}</p>}

      {to && (
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
          View
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
    </>
  )

  const shell = cn(
    'panel group block p-5 transition-colors',
    to && 'hover:border-line-strong hover:bg-raised',
    className,
  )

  return to ? (
    <Link to={to} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}
