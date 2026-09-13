/**
 * Empty, loading and error states.
 *
 * Every view that can be empty, slow or broken renders one of these, so the
 * application never shows a blank panel and never leaves a reader guessing
 * whether it is still working.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CloudOff,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react'
import type { IconComponent } from './icons'
import { Button } from './Button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: IconComponent
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className,
      )}
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-raised">
        <Icon className="h-6 w-6 text-ink-muted" aria-hidden />
      </span>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  )
}

/**
 * Turns an ApiError into the right message.
 *
 * "Cannot reach the service", "you are not allowed to see this" and "that does
 * not exist" are three different problems, and telling them apart is the
 * difference between a user restarting the API and a user filing a bug.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: ApiError
  onRetry?: () => void
  className?: string
}) {
  if (error.isOffline) {
    return (
      <EmptyState
        className={className}
        icon={CloudOff}
        title="The review service is not responding"
        description="The dashboard reached the browser but not the API. Start it with `uvicorn app.main:app --reload` and try again."
        action={onRetry && <Button variant="primary" icon={RefreshCw} onClick={onRetry}>Retry</Button>}
      />
    )
  }

  if (error.status === 401 || error.status === 403) {
    return (
      <EmptyState
        className={className}
        icon={Lock}
        title="Permission denied"
        description={error.detail}
        action={
          <Button variant="secondary" onClick={() => window.location.assign('/settings')}>
            Check the integration settings
          </Button>
        }
      />
    )
  }

  if (error.status === 404) {
    return (
      <EmptyState
        className={className}
        icon={AlertTriangle}
        title="Not found"
        description={error.detail}
        action={
          <Link
            to="/app/pull-requests"
            className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Back to pull requests
          </Link>
        }
      />
    )
  }

  return (
    <EmptyState
      className={className}
      icon={AlertTriangle}
      title="Something went wrong"
      description={error.detail}
      action={onRetry && <Button variant="primary" icon={RefreshCw} onClick={onRetry}>Try again</Button>}
    />
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

/** The dashboard's loading shape: stat row, then two panels. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-32 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" role="status" aria-label="Loading rows">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-28 md:block" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Shown while a review is still running, in place of its findings. */
export function InProgressState({ what = 'This review' }: { what?: string }) {
  return (
    <EmptyState
      icon={Loader2}
      title={`${what} is still running`}
      description="Static analysis runs first, then the AI layer reads the same diff. Findings appear here as soon as both layers finish."
    />
  )
}
