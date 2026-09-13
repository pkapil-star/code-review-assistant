/**
 * The dashboard.
 *
 * The page answers three questions in order, and the layout follows that order
 * rather than filling the viewport with cards: how is the codebase doing, what
 * needs me right now, and what has the pipeline been doing.
 */

import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  FolderGit2,
  GitPullRequest,
  Inbox,
  ListChecks,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { PullRequestTable } from '@/components/review/PullRequestTable'
import {
  CHART_COLORS,
  CategoryBarChart,
  SeverityBreakdown,
  TrendAreaChart,
} from '@/components/charts/Charts'
import { StatusBadge } from '@/components/ui/Badge'
import { useShell } from '@/components/layout/AppShell'
import { useApi } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { duration, relativeTime, scoreTone, titleCase } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { DashboardPayload, Repository } from '@/types'

export default function Dashboard() {
  const { repositoryFilter, status } = useShell()
  const { data, error, loading, refetch, initialising } = useApi<DashboardPayload>(
    () => api.dashboard(),
    [],
  )

  if (initialising) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return null

  // The top bar's repository picker narrows everything below it.
  const scoped = repositoryFilter === 'all'
  const recent = scoped
    ? data.recent
    : data.recent.filter((item) => item.repository === repositoryFilter)
  const attention = scoped
    ? data.needs_attention
    : data.needs_attention.filter((item) => item.repository === repositoryFilter)

  const { summary } = data

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Review activity"
        description={
          scoped
            ? 'Every pull request the service has analysed, across all connected repositories.'
            : `Filtered to ${repositoryFilter}. Change the repository in the top bar to widen this.`
        }
        actions={
          <>
            <Button icon={RefreshCw} onClick={refetch} disabled={loading}>
              Refresh
            </Button>
            <ButtonLink to="/app/pull-requests" variant="primary" iconRight={ArrowRight}>
              All pull requests
            </ButtonLink>
          </>
        }
      />

      {summary.pull_requests_reviewed === 0 ? (
        <Panel>
          <EmptyState
            icon={Inbox}
            title="No pull requests have been reviewed yet"
            description={
              status?.connected
                ? 'The service is configured and listening. Open a pull request on a connected repository and the review will appear here within seconds.'
                : 'Connect the GitHub App first. Until the webhook secret and private key are configured, no pull request events can reach the pipeline.'
            }
            action={
              <ButtonLink
                to="/app/settings"
                variant="primary"
              >
                {status?.connected ? 'Review the configuration' : 'Connect GitHub'}
              </ButtonLink>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pull requests reviewed"
              value={summary.pull_requests_reviewed}
              icon={GitPullRequest}
              hint={`${summary.ai_reviews} included an AI review`}
              to="/app/pull-requests"
            />
            <StatCard
              label="Issues detected"
              value={summary.issues_detected}
              icon={ListChecks}
              hint={`${summary.warnings} warnings · ${summary.suggestions} suggestions`}
            />
            <StatCard
              label="Critical issues"
              value={summary.critical_issues}
              icon={ShieldAlert}
              tone={summary.critical_issues > 0 ? 'critical' : 'success'}
              hint={
                summary.critical_issues > 0
                  ? 'Blocking findings that need a human decision'
                  : 'Nothing blocking across the connected repositories'
              }
              to="/app/pull-requests?status=critical"
            />
            <StatCard
              label="Average review score"
              value={summary.average_score}
              unit="/100"
              icon={CheckCircle2}
              tone={scoreTone(summary.average_score)}
              hint={`Median review took ${duration(summary.average_duration_seconds)}`}
              to="/app/analytics"
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader
                title="Review volume"
                description="Pull requests analysed and findings raised, over the last fourteen days."
              />
              <PanelBody>
                <TrendAreaChart
                  data={data.timeseries as unknown as Record<string, unknown>[]}
                  series={[
                    { key: 'reviews', name: 'Reviews', color: CHART_COLORS.accent },
                    { key: 'findings', name: 'Findings', color: CHART_COLORS.warning },
                  ]}
                />
                <Legend
                  items={[
                    { label: 'Reviews', color: CHART_COLORS.accent },
                    { label: 'Findings', color: CHART_COLORS.warning },
                  ]}
                />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader
                title="Severity distribution"
                description="Across every finding in the store."
              />
              <PanelBody>
                <SeverityBreakdown counts={data.severity_distribution} />

                <div className="mt-6 space-y-3 border-t border-line pt-5">
                  <p className="label-caps">Which layer found them</p>
                  {data.source_distribution.map((entry) => {
                    const total = data.source_distribution.reduce((sum, x) => sum + x.count, 0)
                    const share = total ? (entry.count / total) * 100 : 0

                    return (
                      <div key={entry.source}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-1.5 text-ink-soft">
                            {entry.source === 'ai' ? (
                              <Bot className="h-4 w-4 text-accent" aria-hidden />
                            ) : (
                              <ScanLine className="h-4 w-4 text-ink-muted" aria-hidden />
                            )}
                            {entry.source === 'ai' ? 'AI review' : 'Static analysis'}
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-ink">
                            {entry.count}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              entry.source === 'ai' ? 'bg-accent' : 'bg-ink-muted',
                            )}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </PanelBody>
            </Panel>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader
                title="Needs attention"
                description="Reviewed, still carrying findings, and not yet decided by a human."
                icon={TriangleAlert}
                action={
                  <ButtonLink to="/app/pull-requests?status=critical" size="sm">
                    View all
                  </ButtonLink>
                }
              />
              {attention.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing is waiting on you"
                  description="Every pull request with findings has already been approved or had changes requested."
                />
              ) : (
                <PanelBody flush>
                  <PullRequestTable items={attention} />
                </PanelBody>
              )}
            </Panel>

            <Panel>
              <PanelHeader
                title="Most common issues"
                description="The rules that fire most often."
              />
              <PanelBody>
                {data.top_rules.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">No findings yet.</p>
                ) : (
                  <CategoryBarChart
                    height={Math.max(200, data.top_rules.length * 38)}
                    data={data.top_rules.map((entry) => ({
                      name: entry.rule,
                      value: entry.count,
                    }))}
                  />
                )}
              </PanelBody>
            </Panel>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader
                title="Recent pull requests"
                action={
                  <ButtonLink to="/app/pull-requests" size="sm" iconRight={ArrowRight}>
                    All
                  </ButtonLink>
                }
              />
              {recent.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No pull requests in this repository"
                  description="Select a different repository in the top bar, or open a pull request on this one."
                />
              ) : (
                <PanelBody flush>
                  <PullRequestTable items={recent} />
                </PanelBody>
              )}
            </Panel>

            <div className="space-y-6">
              <Panel>
                <PanelHeader title="Repository health" icon={FolderGit2} />
                <PanelBody flush>
                  <RepositoryHealth repositories={data.repositories} />
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHeader title="Recent review activity" icon={Clock} />
                <PanelBody flush>
                  <ul className="divide-y divide-line">
                    {data.activity.map((item) => (
                      <li key={`${item.id}-${item.at}`}>
                        <Link
                          to={`/app/pull-requests/${item.id}`}
                          className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-raised"
                        >
                          <span className="mt-0.5">
                            {item.ai_used ? (
                              <Bot className="h-4 w-4 text-accent" aria-hidden />
                            ) : (
                              <ScanLine className="h-4 w-4 text-ink-muted" aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {item.title}
                            </span>
                            <span className="mt-0.5 block font-mono text-xs text-ink-muted">
                              {item.repository}#{item.number} · {item.findings} findings ·{' '}
                              {relativeTime(item.at)}
                            </span>
                          </span>
                          <StatusBadge status={item.status} size="sm" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </PanelBody>
              </Panel>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

function RepositoryHealth({ repositories }: { repositories: Repository[] }) {
  if (repositories.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-ink-muted">No repositories are connected yet.</p>
    )
  }

  return (
    <ul className="divide-y divide-line">
      {repositories.map((repository) => (
        <li key={repository.id} className="px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/app/repositories"
              className="min-w-0 truncate font-mono text-sm text-ink-soft hover:text-ink"
            >
              {repository.full_name}
            </Link>
            <span
              className={cn(
                'shrink-0 font-mono text-base font-semibold tabular-nums',
                repository.health_score >= 85
                  ? 'text-success'
                  : repository.health_score >= 65
                    ? 'text-warning'
                    : 'text-critical',
              )}
            >
              {repository.health_score || '—'}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700',
                repository.health_score >= 85
                  ? 'bg-success'
                  : repository.health_score >= 65
                    ? 'bg-warning'
                    : 'bg-critical',
              )}
              style={{ width: `${repository.health_score}%` }}
            />
          </div>
          <p className="mt-1.5 font-mono text-xs text-ink-muted">
            {repository.reviews_count} reviews · {repository.open_findings} open findings ·{' '}
            {titleCase(repository.language)}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
