/**
 * The pull request list.
 *
 * A table on a laptop or a projector, and stacked cards below the md
 * breakpoint, because a six-column table on a phone is unreadable no matter how
 * it scrolls. Both render the same data from the same component, so they cannot
 * drift apart.
 */

import { Link } from 'react-router-dom'
import { Bot, GitBranch, ShieldAlert, TriangleAlert } from 'lucide-react'
import { DemoBadge, StatusBadge } from '@/components/ui/Badge'
import { ScoreChip } from '@/components/ui/ReviewScore'
import { duration, relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { PullRequestListItem } from '@/types'

export function PullRequestTable({ items }: { items: PullRequestListItem[] }) {
  return (
    <>
      {/* Table from md up. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {['Pull request', 'Repository', 'Status', 'Findings', 'Score', 'Updated'].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="label-caps whitespace-nowrap px-5 py-3 font-semibold"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={item.id} className="group transition-colors hover:bg-raised">
                <td className="max-w-[26rem] px-5 py-4">
                  <Link
                    to={`/app/pull-requests/${item.id}`}
                    className="block focus:outline-none focus-visible:underline"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm text-ink-muted">#{item.number}</span>
                      <span className="truncate text-base font-semibold text-ink group-hover:text-accent">
                        {item.title}
                      </span>
                      {item.is_demo && <DemoBadge />}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-muted">
                      <span>{item.author || 'unknown author'}</span>
                      {item.head_branch && (
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" aria-hidden />
                          {item.head_branch}
                        </span>
                      )}
                      {item.ai_used && (
                        <span className="flex items-center gap-1 text-accent">
                          <Bot className="h-3 w-3" aria-hidden />
                          AI review
                        </span>
                      )}
                    </span>
                  </Link>
                </td>

                <td className="whitespace-nowrap px-5 py-4 font-mono text-sm text-ink-soft">
                  {item.repository}
                </td>

                <td className="whitespace-nowrap px-5 py-4">
                  <StatusBadge status={item.status} />
                  {item.decision === 'approved' && (
                    <span className="mt-1 block font-mono text-xs text-success">approved</span>
                  )}
                  {item.decision === 'changes_requested' && (
                    <span className="mt-1 block font-mono text-xs text-warning">
                      changes requested
                    </span>
                  )}
                </td>

                <td className="whitespace-nowrap px-5 py-4">
                  <FindingCounts item={item} />
                </td>

                <td className="whitespace-nowrap px-5 py-4">
                  <ScoreChip score={item.score} pending={item.status === 'reviewing'} />
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-muted">
                  <span className="block">{relativeTime(item.updated_at)}</span>
                  <span className="block font-mono text-xs">
                    {item.duration_seconds ? `in ${duration(item.duration_seconds)}` : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards below md. */}
      <ul className="divide-y divide-line md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={`/app/pull-requests/${item.id}`} className="block px-4 py-4 hover:bg-raised">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-ink">
                  {item.title}
                </p>
                <ScoreChip score={item.score} pending={item.status === 'reviewing'} />
              </div>

              <p className="mt-1.5 font-mono text-xs text-ink-muted">
                {item.repository}#{item.number} · {item.author}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} size="sm" />
                <FindingCounts item={item} />
                <span className="ml-auto text-xs text-ink-muted">
                  {relativeTime(item.updated_at)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function FindingCounts({ item }: { item: PullRequestListItem }) {
  if (item.status === 'reviewing') {
    return <span className="font-mono text-sm text-ink-muted">running…</span>
  }

  if (item.findings_count === 0) {
    return <span className="font-mono text-sm text-success">clean</span>
  }

  return (
    <span className="flex items-center gap-3 font-mono text-sm">
      {item.counts.error > 0 && (
        <span className="flex items-center gap-1 text-critical" title="Critical findings">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          {item.counts.error}
        </span>
      )}
      {item.counts.warning > 0 && (
        <span className="flex items-center gap-1 text-warning" title="Warnings">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          {item.counts.warning}
        </span>
      )}
      <span className={cn('text-ink-muted', item.findings_count === 0 && 'hidden')}>
        {item.findings_count} total
      </span>
    </span>
  )
}
