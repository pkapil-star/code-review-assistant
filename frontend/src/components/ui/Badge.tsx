/**
 * Status and severity badges.
 *
 * Each badge carries an icon and a word as well as a colour. A projector, a
 * colour-blind viewer and a greyscale printout all have to resolve the same
 * meaning, so colour is never the only signal.
 */

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  Lightbulb,
  Loader2,
  OctagonAlert,
  ScanLine,
  ShieldAlert,
  XOctagon,
} from 'lucide-react'
import type { IconComponent } from './icons'
import type { FindingSource, ReviewStatus, Severity } from '@/types'
import { SEVERITY_LABEL, STATUS_LABEL } from '@/lib/format'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'critical'

const TONES: Record<Tone, string> = {
  neutral: 'border-line-strong bg-raised text-ink-soft',
  accent: 'border-accent/45 bg-accent/12 text-accent',
  success: 'border-success/45 bg-success/12 text-success',
  warning: 'border-warning/45 bg-warning/12 text-warning',
  critical: 'border-critical/50 bg-critical/12 text-critical',
}

const SIZES = {
  sm: 'h-6 gap-1 px-2 text-xs',
  md: 'h-7 gap-1.5 px-2.5 text-xs',
  lg: 'h-8 gap-2 px-3 text-sm',
}

export function Badge({
  tone = 'neutral',
  size = 'md',
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone
  size?: keyof typeof SIZES
  icon?: IconComponent
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.06em]',
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {Icon && <Icon className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />}
      {children}
    </span>
  )
}

const STATUS_STYLE: Record<ReviewStatus, { tone: Tone; icon: IconComponent }> = {
  passed: { tone: 'success', icon: CheckCircle2 },
  needs_changes: { tone: 'warning', icon: AlertTriangle },
  critical: { tone: 'critical', icon: OctagonAlert },
  reviewing: { tone: 'accent', icon: Loader2 },
  queued: { tone: 'neutral', icon: CircleDashed },
  failed: { tone: 'critical', icon: XOctagon },
}

export function StatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: ReviewStatus
  size?: keyof typeof SIZES
  className?: string
}) {
  const { tone, icon: Icon } = STATUS_STYLE[status]

  return (
    <Badge tone={tone} size={size} className={className}>
      <Icon
        className={cn(
          size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5',
          status === 'reviewing' && 'animate-spin',
        )}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </Badge>
  )
}

const SEVERITY_STYLE: Record<Severity, { tone: Tone; icon: IconComponent }> = {
  error: { tone: 'critical', icon: ShieldAlert },
  warning: { tone: 'warning', icon: AlertTriangle },
  info: { tone: 'accent', icon: Lightbulb },
}

export function SeverityBadge({
  severity,
  size = 'md',
  className,
}: {
  severity: Severity
  size?: keyof typeof SIZES
  className?: string
}) {
  const { tone, icon } = SEVERITY_STYLE[severity]

  return (
    <Badge tone={tone} size={size} icon={icon} className={className}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  )
}

/**
 * Which layer produced a finding.
 *
 * This is the badge the whole product hangs on: it is how a reader tells the
 * rule-based half of the review from the model-written half.
 */
export function SourceBadge({
  source,
  size = 'sm',
  className,
}: {
  source: FindingSource
  size?: keyof typeof SIZES
  className?: string
}) {
  return source === 'ai' ? (
    <Badge tone="accent" size={size} icon={Bot} className={className}>
      AI review
    </Badge>
  ) : (
    <Badge tone="neutral" size={size} icon={ScanLine} className={className}>
      Static analysis
    </Badge>
  )
}

/** Marks anything rendered from example data rather than a real review. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      title="Example data. Records produced by a real webhook replace it."
      className={cn(
        'inline-flex h-6 items-center rounded border border-line-strong bg-sunken px-2 font-mono text-xs font-medium uppercase tracking-[0.09em] text-ink-muted',
        className,
      )}
    >
      demo
    </span>
  )
}
