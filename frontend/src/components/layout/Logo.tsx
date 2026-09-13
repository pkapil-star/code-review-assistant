/** The wordmark. A chevron for code, a check for review; nothing more. */

import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('h-8 w-8', className)}>
      <rect width="32" height="32" rx="7" className="fill-sunken" />
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="6.25"
        className="stroke-accent/55"
        strokeWidth="1.5"
      />
      <path
        d="M11.5 11 L7 16 L11.5 21"
        className="stroke-accent"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 20.5 L19.5 23.5 L26 15"
        className="stroke-success"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Wordmark({
  className,
  subtitle = true,
}: {
  className?: string
  subtitle?: boolean
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="min-w-0 leading-tight">
        <span className="block text-[1.0625rem] font-bold tracking-tight text-ink">
          Review<span className="text-accent">Pilot</span>
        </span>
        {subtitle && (
          <span className="block font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-muted">
            code review assistant
          </span>
        )}
      </span>
    </span>
  )
}
