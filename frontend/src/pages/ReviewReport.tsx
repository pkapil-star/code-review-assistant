/**
 * The review report.
 *
 * The review page is for working through a change. This page is for presenting
 * the conclusion: one column, larger type, every section self-contained, and no
 * interaction required to read it. It is the page to put on a projector, and it
 * prints to a sensible document.
 */

import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  Gauge,
  Lightbulb,
  Printer,
  ScanLine,
  ShieldAlert,
  TestTube2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { Button, ButtonAnchor, ButtonLink } from '@/components/ui/Button'
import { DemoBadge, SeverityBadge, SourceBadge, StatusBadge } from '@/components/ui/Badge'
import { ReviewScore } from '@/components/ui/ReviewScore'
import { ErrorState, PageSkeleton } from '@/components/ui/States'
import { SeverityBreakdown } from '@/components/charts/Charts'
import { MetricCard, type MetricTone } from '@/components/review/MetricCard'
import { useApi } from '@/hooks/useApi'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { absoluteTime, duration, percent, signed, titleCase } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Finding, PullRequestDetail, Severity } from '@/types'

export default function ReviewReport() {
  const { id = '' } = useParams()
  const { push } = useToast()
  const { data, error, refetch, initialising } = useApi<PullRequestDetail>(
    () => api.pullRequest(id),
    [id],
  )

  const counts = useMemo(() => {
    const totals: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
    data?.findings.forEach((finding) => {
      totals[finding.severity] += 1
    })
    return totals
  }, [data])

  const categories = useMemo(() => {
    const totals = new Map<string, number>()
    data?.findings.forEach((finding) => {
      totals.set(finding.category, (totals.get(finding.category) ?? 0) + 1)
    })
    return [...totals.entries()].sort(([, a], [, b]) => b - a)
  }, [data])

  const files = useMemo(() => {
    const totals = new Map<string, Finding[]>()
    data?.findings.forEach((finding) => {
      totals.set(finding.path, [...(totals.get(finding.path) ?? []), finding])
    })
    return [...totals.entries()].sort(([, a], [, b]) => b.length - a.length)
  }, [data])

  if (initialising) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return null

  /**
   * Export writes the report as a JSON file the browser downloads.
   *
   * The whole record is already in memory, so no round trip is needed, and JSON
   * keeps the export machine-readable for whatever consumes it next.
   */
  function exportReport() {
    if (!data) return

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `review-${data.repository.replace('/', '-')}-${data.number}.json`
    link.click()
    URL.revokeObjectURL(url)

    push({
      tone: 'success',
      title: 'Report exported',
      description: `${link.download} saved to your downloads.`,
    })
  }

  const aiFindings = data.findings.filter((finding) => finding.source === 'ai')
  const criticalFindings = data.findings.filter((finding) => finding.severity === 'error')

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { label: 'Pull requests', to: '/app/pull-requests' },
          { label: `#${data.number}`, to: `/app/pull-requests/${id}` },
          { label: 'Report' },
        ]}
        eyebrow="Review report"
        title={data.title}
        description={
          <span className="font-mono text-sm">
            {data.repository}#{data.number} · {data.author || 'unknown author'} ·{' '}
            {absoluteTime(data.updated_at)}
          </span>
        }
        actions={
          <>
            {data.is_demo && <DemoBadge />}
            <ButtonLink to={`/app/pull-requests/${id}`} icon={ArrowLeft}>
              Back to review
            </ButtonLink>
            <Button icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
            <Button icon={Download} onClick={exportReport}>
              Export report
            </Button>
            <ButtonAnchor href={data.html_url} variant="primary" icon={ExternalLink}>
              Open GitHub PR
            </ButtonAnchor>
          </>
        }
      />

      <div className="space-y-6">
        {/* 1. The verdict, large enough to read from the back of a room. */}
        <Panel>
          <div className="flex flex-col items-center gap-8 p-8 text-center sm:flex-row sm:text-left">
            <ReviewScore score={data.score} size="lg" />

            <div className="min-w-0 flex-1">
              <StatusBadge status={data.status} size="lg" />
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink">
                {recommendationTitle(data, counts)}
              </h2>
              <p className="mt-2 text-base leading-relaxed text-ink-muted">
                {recommendationBody(data, counts)}
              </p>
            </div>

            <dl className="grid shrink-0 grid-cols-3 gap-6 border-line sm:border-l sm:pl-8">
              <Figure label="Critical" value={counts.error} tone={counts.error ? 'critical' : 'success'} />
              <Figure label="Warnings" value={counts.warning} tone="warning" />
              <Figure label="Suggestions" value={counts.info} tone="accent" />
            </dl>
          </div>
        </Panel>

        {/* 2. Executive summary. */}
        <Panel>
          <PanelHeader
            title="Executive summary"
            icon={Bot}
            description={
              data.ai_used
                ? 'Written by the AI layer after reading the full diff.'
                : 'Static analysis only; the AI layer did not run.'
            }
          />
          <PanelBody>
            <p className="whitespace-pre-line text-lg leading-relaxed text-ink-soft">
              {data.summary ||
                'The review completed with no summary. The findings below are from the static layer.'}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-line pt-5 font-mono text-sm sm:grid-cols-4">
              <Fact label="Files reviewed" value={String(data.files_reviewed)} />
              <Fact label="Lines" value={`+${data.additions} / -${data.deletions}`} />
              <Fact label="Review time" value={duration(data.duration_seconds)} />
              <Fact
                label="Posted to GitHub"
                value={data.posted ? 'yes' : 'no'}
                tone={data.posted ? 'text-success' : 'text-warning'}
              />
            </dl>
          </PanelBody>
        </Panel>

        {/* 3. Critical issues. */}
        <Panel className={criticalFindings.length > 0 ? 'border-critical/35' : undefined}>
          <PanelHeader
            title={`Critical issues (${criticalFindings.length})`}
            icon={ShieldAlert}
            description="Findings that block the merge."
          />
          <PanelBody className="space-y-4">
            {criticalFindings.length === 0 ? (
              <p className="flex items-center gap-2.5 text-base text-success">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
                No blocking findings were raised on the changed lines.
              </p>
            ) : (
              criticalFindings.map((finding) => (
                <ReportFinding key={finding.id} finding={finding} />
              ))
            )}
          </PanelBody>
        </Panel>

        {/* 4. Metrics. */}
        <Panel>
          <PanelHeader
            title="Code quality metrics"
            icon={Gauge}
            description="Measured by the static layer against the project's thresholds."
          />
          <PanelBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Cyclomatic complexity"
                value={data.metrics.cyclomatic_complexity || '—'}
                threshold="limit 10"
                ratio={data.metrics.cyclomatic_complexity / 20}
                tone={toneFor(data.metrics.cyclomatic_complexity, 10, 7)}
                icon={Activity}
              />
              <MetricCard
                label="Longest function"
                value={data.metrics.max_function_length || '—'}
                unit="lines"
                threshold="limit 50"
                ratio={data.metrics.max_function_length / 80}
                tone={toneFor(data.metrics.max_function_length, 50, 35)}
                icon={FileCode2}
              />
              <MetricCard
                label="Duplication"
                value={percent(data.metrics.duplication_ratio)}
                threshold="target under 10%"
                ratio={data.metrics.duplication_ratio * 3}
                tone={toneFor(data.metrics.duplication_ratio, 0.2, 0.1)}
                icon={Gauge}
              />
              <MetricCard
                label="Test files changed"
                value={data.metrics.test_files_changed}
                threshold={`${data.metrics.source_files_changed} source files`}
                ratio={
                  data.metrics.source_files_changed
                    ? data.metrics.test_files_changed / data.metrics.source_files_changed
                    : 0
                }
                tone={data.metrics.test_files_changed > 0 ? 'success' : 'critical'}
                icon={TestTube2}
              />
              <MetricCard
                label="Coverage delta"
                value={signed(data.metrics.estimated_coverage_delta)}
                unit="pp"
                tone={data.metrics.estimated_coverage_delta >= 0 ? 'success' : 'warning'}
                icon={Activity}
              />
              <MetricCard
                label="Naming and style"
                value={data.metrics.naming_violations}
                unit="violations"
                tone={data.metrics.naming_violations === 0 ? 'success' : 'warning'}
                icon={CheckCircle2}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* 5. Distribution. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Issue distribution" />
            <PanelBody>
              <SeverityBreakdown
                counts={[
                  { severity: 'error', count: counts.error },
                  { severity: 'warning', count: counts.warning },
                  { severity: 'info', count: counts.info },
                ]}
              />

              {categories.length > 0 && (
                <div className="mt-7 space-y-2.5 border-t border-line pt-5">
                  <p className="label-caps mb-3">By category</p>
                  {categories.map(([category, count]) => (
                    <div key={category} className="flex items-center gap-4">
                      <span className="w-32 shrink-0 text-sm text-ink-soft">
                        {titleCase(category)}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${(count / data.findings.length) * 100}%` }}
                        />
                      </div>
                      <span className="w-7 shrink-0 text-right font-mono text-sm tabular-nums text-ink">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Files affected"
              description="Where the findings land."
            />
            <PanelBody flush>
              {files.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-muted">No files carry findings.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {files.map(([path, entries]) => {
                    const criticals = entries.filter((f) => f.severity === 'error').length

                    return (
                      <li key={path} className="flex items-center gap-3 px-5 py-3.5">
                        <FileCode2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink-soft">
                          {path}
                        </span>
                        {criticals > 0 && (
                          <span className="shrink-0 font-mono text-sm font-semibold text-critical">
                            {criticals} critical
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-sm text-ink-muted">
                          {entries.length}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>

        {/* 6. AI recommendations. */}
        <Panel>
          <PanelHeader
            title={`AI recommendations (${aiFindings.length})`}
            icon={Lightbulb}
            description="Findings that depend on what the code means, which a rule cannot express."
          />
          <PanelBody className="space-y-4">
            {aiFindings.length === 0 ? (
              <p className="text-base text-ink-muted">
                {data.ai_used
                  ? 'The model read the diff and raised nothing beyond what the rules found.'
                  : 'The AI layer did not run for this review.'}
              </p>
            ) : (
              aiFindings.map((finding) => <ReportFinding key={finding.id} finding={finding} />)
            )}
          </PanelBody>
        </Panel>

        {/* 7. Final recommendation. */}
        <Panel
          className={cn(
            'border-2',
            counts.error > 0
              ? 'border-critical/45'
              : counts.warning > 0
                ? 'border-warning/45'
                : 'border-success/45',
          )}
        >
          <PanelBody className="p-8 text-center">
            <p className="label-caps">Final recommendation</p>
            <p
              className={cn(
                'mt-3 text-4xl font-bold tracking-tight',
                counts.error > 0
                  ? 'text-critical'
                  : counts.warning > 0
                    ? 'text-warning'
                    : 'text-success',
              )}
            >
              {counts.error > 0
                ? 'Do not merge'
                : counts.warning > 0
                  ? 'Merge after review'
                  : 'Ready to merge'}
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
              {recommendationBody(data, counts)}
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <ButtonAnchor href={data.html_url} variant="primary" size="lg" icon={ExternalLink}>
                Open the pull request
              </ButtonAnchor>
              <ButtonLink to={`/app/pull-requests/${id}`} size="lg" icon={ScanLine}>
                Re-read the findings
              </ButtonLink>
              <ButtonLink to="/app/pull-requests" size="lg">
                Review another
              </ButtonLink>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  )
}

function ReportFinding({ finding }: { finding: Finding }) {
  return (
    <article className="rounded-md border border-line bg-raised p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <SourceBadge source={finding.source} />
        <span className="font-mono text-xs text-ink-muted">
          {finding.path}
          {finding.line !== null && <span className="text-accent">:{finding.line}</span>}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-ink">{finding.title}</h3>
      <p className="mt-2 text-base leading-relaxed text-ink-soft">{finding.message}</p>

      {finding.why_it_matters && (
        <p className="mt-3 border-l-2 border-warning/50 pl-4 text-sm leading-relaxed text-ink-muted">
          <strong className="font-semibold text-ink-soft">Why it matters. </strong>
          {finding.why_it_matters}
        </p>
      )}

      {finding.suggested_fix && (
        <div className="mt-3.5">
          <p className="label-caps mb-1.5">Suggested fix</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-success/25 bg-success/[0.06] p-3 font-mono text-[0.8125rem] leading-relaxed text-ink-soft">
            {finding.suggested_fix}
          </pre>
        </div>
      )}
    </article>
  )
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'critical' | 'warning' | 'accent' | 'success'
}) {
  const colors = {
    critical: 'text-critical',
    warning: 'text-warning',
    accent: 'text-accent',
    success: 'text-success',
  }

  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className={cn('mt-1 font-mono text-3xl font-semibold tabular-nums', colors[tone])}>
        {value}
      </dd>
    </div>
  )
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className={cn('mt-1 text-base text-ink', tone)}>{value}</dd>
    </div>
  )
}

function toneFor(value: number, critical: number, warning: number): MetricTone {
  if (value > critical) return 'critical'
  if (value > warning) return 'warning'
  return 'success'
}

function recommendationTitle(
  data: PullRequestDetail,
  counts: Record<Severity, number>,
): string {
  if (counts.error > 0) return 'This pull request should not merge yet'
  if (counts.warning > 0) return 'Mergeable, with points a reviewer should check'
  if (data.findings.length > 0) return 'Clean, with minor suggestions'
  return 'Nothing to report'
}

function recommendationBody(
  data: PullRequestDetail,
  counts: Record<Severity, number>,
): string {
  const parts: string[] = []

  if (counts.error > 0) {
    parts.push(
      `${counts.error} blocking finding${counts.error > 1 ? 's' : ''} ${counts.error > 1 ? 'were' : 'was'} raised on the changed lines.`,
    )
  }

  if (counts.warning > 0) {
    parts.push(`${counts.warning} warning${counts.warning > 1 ? 's' : ''} need a reviewer's judgement.`)
  }

  if (data.metrics.test_files_changed === 0 && data.metrics.source_files_changed > 0) {
    parts.push('The change ships with no test of its own.')
  }

  if (parts.length === 0) {
    parts.push(
      'Every rule passed on the changed lines and the AI layer raised no contextual concerns.',
    )
  }

  return parts.join(' ')
}
