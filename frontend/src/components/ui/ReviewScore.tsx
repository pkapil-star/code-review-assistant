/**
 * The review score, drawn as a ring.
 *
 * The number is the single figure a reviewer looks at first, so it is set in
 * mono at a size that survives a projector, and the ring gives the same
 * information a second way for anyone who cannot separate the colours.
 */

import { scoreBand, scoreTone } from '@/lib/format'
import { cn } from '@/lib/cn'

const SIZES = {
  sm: { box: 56, stroke: 5, text: 'text-lg' },
  md: { box: 86, stroke: 7, text: 'text-2xl' },
  lg: { box: 132, stroke: 9, text: 'text-4xl' },
}

const TONE_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  critical: 'text-critical',
}

const BAND_LABEL = {
  strong: 'Healthy',
  fair: 'Borderline',
  weak: 'At risk',
}

export function ReviewScore({
  score,
  size = 'md',
  showLabel = true,
  pending = false,
  className,
}: {
  score: number
  size?: keyof typeof SIZES
  showLabel?: boolean
  /** Draw an empty ring when the review has not finished yet. */
  pending?: boolean
  className?: string
}) {
  const { box, stroke, text } = SIZES[size]
  const radius = (box - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = pending ? 0 : (score / 100) * circumference
  const tone = TONE_CLASS[scoreTone(score)]

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <div className="relative" style={{ width: box, height: box }}>
        <svg
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          role="img"
          aria-label={pending ? 'Review in progress' : `Review score ${score} out of 100`}
        >
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-line"
          />
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${box / 2} ${box / 2})`}
            className={cn('transition-[stroke-dasharray] duration-700 ease-out', tone)}
            stroke="currentColor"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('font-mono font-semibold tabular-nums', text, pending ? 'text-ink-muted' : tone)}>
            {pending ? '—' : score}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="label-caps">
          {pending ? 'In progress' : BAND_LABEL[scoreBand(score)]}
        </span>
      )}
    </div>
  )
}

/** A compact inline score for table rows, where a ring would be too heavy. */
export function ScoreChip({ score, pending = false }: { score: number; pending?: boolean }) {
  if (pending) {
    return <span className="font-mono text-sm text-ink-muted">—</span>
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('font-mono text-lg font-semibold tabular-nums', TONE_CLASS[scoreTone(score)])}>
        {score}
      </span>
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-line sm:block">
        <span
          className={cn('block h-full rounded-full bg-current', TONE_CLASS[scoreTone(score)])}
          style={{ width: `${score}%` }}
        />
      </span>
    </span>
  )
}
