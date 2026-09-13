/**
 * Quality metrics, shown as a measurement against a threshold.
 *
 * A number on its own ("complexity 12") tells a reader nothing. Each metric is
 * therefore rendered with the limit it is judged against and a bar showing how
 * close it is, which is the difference between data and a verdict.
 */

import type { IconComponent } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

export type MetricTone = 'success' | 'warning' | 'critical' | 'neutral'

const TONE_TEXT: Record<MetricTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  critical: 'text-critical',
  neutral: 'text-ink',
}

const TONE_BAR: Record<MetricTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  neutral: 'bg-ink-muted',
}

export function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'neutral',
  threshold,
  ratio,
  note,
}: {
  label: string
  value: string | number
  unit?: string
  icon?: IconComponent
  tone?: MetricTone
  /** Rendered as "limit 10", so the number has something to mean. */
  threshold?: string
  /** 0-1, how full the bar is. */
  ratio?: number
  note?: string
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="label-caps flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </p>

      <p className="mt-2.5 flex items-baseline gap-1.5">
        <span className={cn('font-mono text-2xl font-semibold tabular-nums', TONE_TEXT[tone])}>
          {value}
        </span>
        {unit && <span className="font-mono text-sm text-ink-muted">{unit}</span>}
        {threshold && <span className="ml-auto font-mono text-xs text-ink-muted">{threshold}</span>}
      </p>

      {ratio !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className={cn('h-full rounded-full transition-[width] duration-700', TONE_BAR[tone])}
            style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }}
          />
        </div>
      )}

      {note && <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">{note}</p>}
    </div>
  )
}
