/**
 * Long-term quality trends.
 *
 * The dashboard answers "what is happening now". This page answers "is the
 * codebase getting better or worse", which needs a window wider than a day and
 * charts that can be read from across a room.
 */

import { useState } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  Clock,
  Gauge,
  Inbox,
  ScanLine,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Select } from '@/components/ui/Form'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import {
  CHART_COLORS,
  CategoryBarChart,
  ScoreLineChart,
  SeverityBreakdown,
  TrendAreaChart,
} from '@/components/charts/Charts'
import { useApi } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { duration, scoreTone, titleCase } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { AnalyticsPayload } from '@/types'

const WINDOWS = [
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
]

export default function Analytics() {
  const [days, setDays] = useState('30')
  const { data, error, refetch, initialising } = useApi<AnalyticsPayload>(
    () => api.analytics(Number(days)),
    [days],
  )

  if (initialising) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return null

  const { summary } = data
  const series = data.timeseries as unknown as Record<string, unknown>[]

  if (summary.pull_requests_reviewed === 0) {
    return (
      <>
        <PageHeader eyebrow="Analytics" title="Quality trends" />
        <Panel>
          <EmptyState
            icon={Inbox}
            title="There is nothing to chart yet"
            description="Trends need history. Once the pipeline has reviewed a few pull requests, this page fills in on its own."
          />
        </Panel>
      </>
    )
  }

  const aiShare = summary.issues_detected
    ? Math.round(
        ((data.source_distribution.find((entry) => entry.source === 'ai')?.count ?? 0) /
          summary.issues_detected) *
          100,
      )
    : 0

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Quality trends"
        description="How review volume, findings and scores have moved over time, across every connected repository."
        actions={
          <Select
            label="Window"
            hideLabel
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="w-44"
          >
            {WINDOWS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        }
      />

      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Reviews in window"
            value={summary.pull_requests_reviewed}
            icon={BarChart3}
            hint={`across ${summary.repositories} repositories`}
          />
          <StatCard
            label="Average score"
            value={summary.average_score}
            unit="/100"
            icon={TrendingUp}
            tone={scoreTone(summary.average_score)}
            hint="Mean across every finished review"
          />
          <StatCard
            label="Critical findings"
            value={summary.critical_issues}
            icon={ShieldAlert}
            tone={summary.critical_issues > 0 ? 'critical' : 'success'}
            hint={`${summary.warnings} warnings alongside them`}
          />
          <StatCard
            label="Average review time"
            value={duration(summary.average_duration_seconds)}
            icon={Clock}
            hint="Webhook received to review posted"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Review volume and findings"
              description="Pull requests analysed against the findings they produced."
            />
            <PanelBody>
              <TrendAreaChart
                data={series}
                series={[
                  { key: 'reviews', name: 'Reviews', color: CHART_COLORS.accent },
                  { key: 'findings', name: 'Findings', color: CHART_COLORS.warning },
                ]}
                height={300}
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
              title="Critical issues over time"
              description="The series that has to trend down."
            />
            <PanelBody>
              <TrendAreaChart
                data={series}
                series={[{ key: 'critical', name: 'Critical', color: CHART_COLORS.critical }]}
                height={300}
              />
              <Legend items={[{ label: 'Critical findings', color: CHART_COLORS.critical }]} />
            </PanelBody>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Average review score"
              description="Higher is healthier. Days with no review are joined across."
            />
            <PanelBody>
              <ScoreLineChart data={series} height={300} />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Review duration"
              description="Seconds from webhook to posted review."
            />
            <PanelBody>
              <TrendAreaChart
                data={series}
                series={[
                  { key: 'average_duration', name: 'Seconds', color: CHART_COLORS.success },
                ]}
                height={300}
              />
              <Legend items={[{ label: 'Average seconds per review', color: CHART_COLORS.success }]} />
            </PanelBody>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Panel>
            <PanelHeader title="Severity mix" />
            <PanelBody>
              <SeverityBreakdown counts={data.severity_distribution} />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Issue categories"
              description="What kind of problem the review keeps finding."
            />
            <PanelBody>
              {data.category_distribution.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">No findings yet.</p>
              ) : (
                <CategoryBarChart
                  height={Math.max(200, data.category_distribution.length * 40)}
                  data={data.category_distribution.map((entry) => ({
                    name: titleCase(entry.category),
                    value: entry.count,
                  }))}
                />
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Which layer found them"
              description="Static rules against the AI layer."
            />
            <PanelBody>
              <div className="space-y-5">
                {data.source_distribution.map((entry) => {
                  const share = summary.issues_detected
                    ? (entry.count / summary.issues_detected) * 100
                    : 0

                  return (
                    <div key={entry.source}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm text-ink-soft">
                          {entry.source === 'ai' ? (
                            <Bot className="h-4 w-4 text-accent" aria-hidden />
                          ) : (
                            <ScanLine className="h-4 w-4 text-ink-muted" aria-hidden />
                          )}
                          {entry.source === 'ai' ? 'AI review' : 'Static analysis'}
                        </span>
                        <span className="font-mono text-2xl font-semibold tabular-nums text-ink">
                          {entry.count}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            entry.source === 'ai' ? 'bg-accent' : 'bg-ink-muted',
                          )}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <p className="mt-1 font-mono text-xs text-ink-muted">
                        {Math.round(share)}% of all findings
                      </p>
                    </div>
                  )
                })}
              </div>

              <p className="mt-6 border-t border-line pt-4 text-sm leading-relaxed text-ink-muted">
                {aiShare}% of findings came from the AI layer. Those are the ones a rule could not
                have expressed, which is the case for having it.
              </p>
            </PanelBody>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Repository comparison"
              icon={Gauge}
              description="Health score, review volume and findings side by side."
            />
            <PanelBody flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      {['Repository', 'Reviews', 'Findings', 'Critical', 'Health'].map((heading) => (
                        <th key={heading} scope="col" className="label-caps px-5 py-3">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.repositories.map((entry) => (
                      <tr key={entry.repository} className="transition-colors hover:bg-raised">
                        <td className="px-5 py-3.5 font-mono text-sm text-ink-soft">
                          {entry.repository}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm tabular-nums text-ink">
                          {entry.reviews}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-sm tabular-nums text-ink">
                          {entry.findings}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3.5 font-mono text-sm tabular-nums',
                            entry.critical > 0 ? 'text-critical' : 'text-success',
                          )}
                        >
                          {entry.critical}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                'font-mono text-base font-semibold tabular-nums',
                                entry.health_score >= 85
                                  ? 'text-success'
                                  : entry.health_score >= 65
                                    ? 'text-warning'
                                    : 'text-critical',
                              )}
                            >
                              {entry.health_score || '—'}
                            </span>
                            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line sm:block">
                              <span
                                className={cn(
                                  'block h-full rounded-full',
                                  entry.health_score >= 85
                                    ? 'bg-success'
                                    : entry.health_score >= 65
                                      ? 'bg-warning'
                                      : 'bg-critical',
                                )}
                                style={{ width: `${entry.health_score}%` }}
                              />
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Complexity against score"
              icon={Activity}
              description="Each reviewed pull request, worst complexity first."
            />
            <PanelBody flush>
              {data.complexity.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-muted">
                  No complexity was recorded for these reviews.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {[...data.complexity]
                    .sort((a, b) => b.complexity - a.complexity)
                    .map((entry) => (
                      <li
                        key={`${entry.repository}-${entry.pull_request}`}
                        className="flex items-center gap-4 px-5 py-3.5"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-soft">
                          {entry.repository}#{entry.pull_request}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 font-mono text-sm tabular-nums',
                            entry.complexity > 10 ? 'text-critical' : 'text-ink-muted',
                          )}
                          title="Worst cyclomatic complexity in the change"
                        >
                          cc {entry.complexity}
                        </span>
                        <span
                          className={cn(
                            'w-10 shrink-0 text-right font-mono text-base font-semibold tabular-nums',
                            entry.score >= 85
                              ? 'text-success'
                              : entry.score >= 65
                                ? 'text-warning'
                                : 'text-critical',
                          )}
                        >
                          {entry.score}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </section>
      </div>
    </>
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
