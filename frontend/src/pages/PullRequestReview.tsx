/**
 * The pull request review page.
 *
 * This is the screen the product is for. It puts three things on one surface
 * that a reviewer normally has to hold in their head across three tools: the
 * diff, the rule-based findings, and the model's reading of the same change.
 *
 * Layout: the change on the left, the review's judgement on the right. Every
 * finding states which layer produced it, because a rule match and a model's
 * argument deserve different amounts of trust and the reader has to be able to
 * tell them apart without being told.
 */

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  Braces,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileCode2,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  Gauge,
  Layers,
  Lightbulb,
  ListChecks,
  MessageSquareCode,
  RefreshCw,
  Ruler,
  ScanLine,
  ShieldAlert,
  TestTube2,
  User,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { Button, ButtonAnchor, ButtonLink } from '@/components/ui/Button'
import { Badge, DemoBadge, StatusBadge } from '@/components/ui/Badge'
import { ReviewScore } from '@/components/ui/ReviewScore'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, InProgressState, PageSkeleton } from '@/components/ui/States'
import { CodeDiffViewer } from '@/components/review/CodeDiffViewer'
import { FileTree } from '@/components/review/FileTree'
import { FindingCard } from '@/components/review/FindingCard'
import { MetricCard, type MetricTone } from '@/components/review/MetricCard'
import { SeverityBreakdown } from '@/components/charts/Charts'
import { useApi } from '@/hooks/useApi'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { absoluteTime, duration, percent, shortSha, signed } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Finding, PullRequestDetail, QualityMetrics, Severity } from '@/types'

type TabId = 'overview' | 'changes' | 'findings' | 'metrics' | 'ai'

export default function PullRequestReview() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { push } = useToast()

  const [tab, setTab] = useState<TabId>('overview')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'static' | 'ai'>('all')
  const [target, setTarget] = useState<{ path: string; line: number } | null>(null)
  const [decisionPrompt, setDecisionPrompt] = useState<'approved' | 'changes_requested' | null>(null)
  const [saving, setSaving] = useState(false)

  const { data, error, refetch, initialising } = useApi<PullRequestDetail>(
    () => api.pullRequest(id),
    [id],
  )

  const findings = data?.findings ?? []
  const staticFindings = useMemo(
    () => findings.filter((finding) => finding.source === 'static'),
    [findings],
  )
  const aiFindings = useMemo(
    () => findings.filter((finding) => finding.source === 'ai'),
    [findings],
  )

  const counts = useMemo(() => countSeverities(findings), [findings])

  const visibleFindings = useMemo(
    () =>
      findings.filter(
        (finding) =>
          (severityFilter === 'all' || finding.severity === severityFilter) &&
          (sourceFilter === 'all' || finding.source === sourceFilter),
      ),
    [findings, severityFilter, sourceFilter],
  )

  if (initialising) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return null

  const running = data.status === 'reviewing' || data.status === 'queued'

  /** Jump from a finding anywhere on the page to its line in the diff. */
  function jumpToLine(path: string, line: number) {
    setTab('changes')
    setTarget({ path, line })
  }

  async function submitDecision(decision: 'approved' | 'changes_requested') {
    setSaving(true)

    try {
      await api.setDecision(id, decision)
      setDecisionPrompt(null)
      refetch()
      push({
        tone: decision === 'approved' ? 'success' : 'warning',
        title: decision === 'approved' ? 'Marked as approved' : 'Marked as changes requested',
        description:
          'Recorded in ReviewPilot only. Approving on GitHub needs your own account, which this service does not hold.',
      })
    } catch {
      push({
        tone: 'critical',
        title: 'Could not record the decision',
        description: 'The review service did not accept the request. Check that it is running.',
      })
    } finally {
      setSaving(false)
    }
  }

  const tabs: TabItem<TabId>[] = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'changes', label: 'Changes', icon: FileCode2, count: data.files.length || undefined },
    { id: 'findings', label: 'Findings', icon: MessageSquareCode, count: findings.length },
    { id: 'metrics', label: 'Metrics', icon: Gauge },
    { id: 'ai', label: 'AI review', icon: Bot, count: aiFindings.length },
  ]

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Pull requests', to: '/app/pull-requests' },
          { label: `#${data.number}` },
        ]}
        eyebrow={data.repository}
        title={data.title}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-sm">
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" aria-hidden />
              {data.author || 'unknown author'}
            </span>
            <span className="flex items-center gap-1.5">
              <GitBranch className="h-4 w-4" aria-hidden />
              {data.head_branch || 'head'} → {data.base_branch}
            </span>
            {data.head_sha && (
              <span className="flex items-center gap-1.5">
                <GitCommitHorizontal className="h-4 w-4" aria-hidden />
                {shortSha(data.head_sha)}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden />
              reviewed {absoluteTime(data.updated_at)}
            </span>
          </span>
        }
        actions={
          <>
            {data.is_demo && <DemoBadge />}
            <Button icon={RefreshCw} onClick={refetch}>
              Refresh
            </Button>
            <ButtonLink to={`/app/pull-requests/${id}/report`} icon={FileText}>
              Review report
            </ButtonLink>
            <ButtonAnchor href={data.html_url} icon={ExternalLink}>
              Open on GitHub
            </ButtonAnchor>
            <Button
              variant="success"
              icon={CheckCircle2}
              onClick={() => setDecisionPrompt('approved')}
              disabled={running}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              icon={AlertTriangle}
              onClick={() => setDecisionPrompt('changes_requested')}
              disabled={running}
            >
              Request changes
            </Button>
          </>
        }
      />

      <ReviewHeadline data={data} counts={counts} running={running} />

      {data.error && (
        <Panel className="mt-6 border-critical/40">
          <PanelBody>
            <p className="flex items-start gap-2.5 text-sm text-critical">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">The review failed.</strong>{' '}
                <span className="font-mono">{data.error}</span>
              </span>
            </p>
          </PanelBody>
        </Panel>
      )}

      {/*
        The side panel only moves alongside the diff at 2xl. Below that, a
        three-column review page squeezes the code into a column too narrow to
        read, and the diff is the thing the reader came for.
      */}
      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_27rem]">
        {/* Left: the change itself. */}
        <div className="min-w-0">
          <Panel>
            <Tabs items={tabs} value={tab} onChange={setTab} className="px-2" />

            <div className="p-5">
              {running ? (
                <InProgressState />
              ) : tab === 'overview' ? (
                <OverviewTab data={data} onJump={jumpToLine} />
              ) : tab === 'changes' ? (
                <ChangesTab
                  data={data}
                  target={target}
                  onClearTarget={() => setTarget(null)}
                />
              ) : tab === 'findings' ? (
                <FindingsTab
                  findings={visibleFindings}
                  total={findings.length}
                  severityFilter={severityFilter}
                  sourceFilter={sourceFilter}
                  onSeverity={setSeverityFilter}
                  onSource={setSourceFilter}
                  counts={counts}
                  staticCount={staticFindings.length}
                  aiCount={aiFindings.length}
                  onJump={jumpToLine}
                />
              ) : tab === 'metrics' ? (
                <MetricsTab metrics={data.metrics} findings={findings} />
              ) : (
                <AiTab data={data} findings={aiFindings} onJump={jumpToLine} />
              )}
            </div>
          </Panel>
        </div>

        {/* Right: what the review concluded. */}
        <aside className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader
              title="AI review summary"
              icon={Bot}
              description={
                data.ai_used
                  ? 'Written by the model after reading the full diff.'
                  : 'The AI layer did not run for this review.'
              }
            />
            <PanelBody>
              {data.summary ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  {data.summary}
                </p>
              ) : (
                <p className="text-sm text-ink-muted">
                  {running
                    ? 'The model is still reading the diff.'
                    : 'No summary was produced for this review.'}
                </p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Findings by severity" />
            <PanelBody>
              <SeverityBreakdown
                counts={[
                  { severity: 'error', count: counts.error },
                  { severity: 'warning', count: counts.warning },
                  { severity: 'info', count: counts.info },
                ]}
              />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Critical findings"
              icon={ShieldAlert}
              description="Blocking issues, worst first."
            />
            <PanelBody className="space-y-2.5">
              {findings.filter((f) => f.severity === 'error').length === 0 ? (
                <p className="py-2 text-sm text-ink-muted">
                  Nothing blocking was found in the changed lines.
                </p>
              ) : (
                findings
                  .filter((finding) => finding.severity === 'error')
                  .map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      compact
                      onJumpToLine={jumpToLine}
                    />
                  ))
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Review checklist" icon={ClipboardCheck} />
            <PanelBody flush>
              <Checklist data={data} counts={counts} />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Pipeline" icon={Activity} />
            <PanelBody flush>
              <PipelineTrace data={data} staticCount={staticFindings.length} aiCount={aiFindings.length} />
            </PanelBody>
          </Panel>
        </aside>
      </div>

      <Modal
        open={decisionPrompt !== null}
        onClose={() => setDecisionPrompt(null)}
        title={decisionPrompt === 'approved' ? 'Approve this pull request?' : 'Request changes?'}
        description="This decision is recorded in ReviewPilot."
        footer={
          <>
            <Button onClick={() => setDecisionPrompt(null)}>Cancel</Button>
            <Button
              variant={decisionPrompt === 'approved' ? 'success' : 'danger'}
              disabled={saving}
              onClick={() => decisionPrompt && submitDecision(decisionPrompt)}
            >
              {saving ? 'Saving…' : decisionPrompt === 'approved' ? 'Approve' : 'Request changes'}
            </Button>
          </>
        }
      >
        <p>
          The service authenticates to GitHub as an App installation, not as you. A GitHub
          approval has to come from a person's own account, so this records the decision here and
          removes the pull request from the "needs attention" list. The inline findings were
          already posted to the pull request when the review ran.
        </p>
      </Modal>

      {/* A reader who arrived from a stale link gets somewhere to go. */}
      {!running && findings.length === 0 && data.files.length === 0 && (
        <Panel className="mt-6">
          <EmptyState
            icon={BadgeCheck}
            title="This review found nothing to report"
            description="Static analysis and the AI layer both ran over the changed lines and raised no findings."
            action={
              <Button variant="secondary" onClick={() => navigate('/app/pull-requests')}>
                Back to pull requests
              </Button>
            }
          />
        </Panel>
      )}
    </>
  )
}

/** The summary strip: score, counts, size and timing, all above the fold. */
function ReviewHeadline({
  data,
  counts,
  running,
}: {
  data: PullRequestDetail
  counts: Record<Severity, number>
  running: boolean
}) {
  const cells = [
    {
      label: 'Critical',
      value: counts.error,
      tone: counts.error > 0 ? 'text-critical' : 'text-success',
      icon: ShieldAlert,
    },
    { label: 'Warnings', value: counts.warning, tone: 'text-warning', icon: AlertTriangle },
    { label: 'Suggestions', value: counts.info, tone: 'text-accent', icon: Lightbulb },
    {
      label: 'Complexity',
      value: data.metrics.cyclomatic_complexity || '—',
      tone: data.metrics.cyclomatic_complexity > 10 ? 'text-critical' : 'text-ink',
      icon: Ruler,
    },
    {
      label: 'Tests touched',
      value: data.metrics.test_files_changed,
      tone: data.metrics.test_files_changed > 0 ? 'text-success' : 'text-warning',
      icon: TestTube2,
    },
    {
      label: 'Files reviewed',
      value: data.files_reviewed,
      tone: 'text-ink',
      icon: FileCode2,
    },
  ]

  return (
    <Panel>
      <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-5">
          <ReviewScore score={data.score} size="lg" pending={running} />
          <div>
            <StatusBadge status={data.status} size="lg" />
            <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-ink-muted">
              {verdictFor(data, counts)}
            </p>
            {data.decision && (
              <p
                className={cn(
                  'mt-2 font-mono text-xs font-semibold',
                  data.decision === 'approved' ? 'text-success' : 'text-warning',
                )}
              >
                human decision: {data.decision.replace('_', ' ')}
              </p>
            )}
          </div>
        </div>

        {/*
          Six across only once there is genuinely room for six labels. Below
          that they clip, and a clipped label is worse than a second row.
        */}
        <dl className="grid flex-1 grid-cols-2 gap-x-8 gap-y-5 border-t border-line pt-5 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 min-[1800px]:grid-cols-6">
          {cells.map((cell) => (
            <div key={cell.label} className="min-w-0">
              <dt className="label-caps flex items-center gap-1.5">
                <cell.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {cell.label}
              </dt>
              <dd
                className={cn(
                  'mt-1.5 font-mono text-3xl font-semibold tabular-nums',
                  running ? 'text-ink-muted' : cell.tone,
                )}
              >
                {running ? '—' : cell.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-raised px-5 py-3 font-mono text-xs text-ink-muted">
        <span className="text-success">+{data.additions}</span>
        <span className="text-critical">-{data.deletions}</span>
        <span>{data.files_reviewed} files</span>
        <span>review took {duration(data.duration_seconds)}</span>
        <span className="flex items-center gap-1.5">
          <ScanLine className="h-3.5 w-3.5" aria-hidden />
          static analysis
        </span>
        {data.ai_used && (
          <span className="flex items-center gap-1.5 text-accent">
            <Bot className="h-3.5 w-3.5" aria-hidden />
            AI review
          </span>
        )}
        <span className={data.posted ? 'text-success' : 'text-warning'}>
          {data.posted ? 'posted to GitHub' : 'not posted to GitHub'}
        </span>
      </footer>
    </Panel>
  )
}

function OverviewTab({
  data,
  onJump,
}: {
  data: PullRequestDetail
  onJump: (path: string, line: number) => void
}) {
  const top = data.findings.slice(0, 4)

  return (
    <div className="space-y-7">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">What the review concluded</h2>
        <p className="whitespace-pre-line text-base leading-relaxed text-ink-soft">
          {data.summary ||
            'The static layer ran over the changed lines and the AI layer read the same diff. Nothing further was reported.'}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Most serious findings</h2>
        {top.length === 0 ? (
          <p className="text-sm text-ink-muted">No findings were raised on this pull request.</p>
        ) : (
          <div className="space-y-2.5">
            {top.map((finding, index) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                defaultOpen={index === 0}
                onJumpToLine={onJump}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Files this change touches</h2>
        <div className="overflow-hidden rounded-md border border-line">
          <FileTree
            files={data.files}
            findings={data.findings}
            activePath={null}
            onSelect={(path) => {
              const first = data.findings.find(
                (finding) => finding.path === path && finding.line !== null,
              )
              if (first?.line) onJump(path, first.line)
            }}
          />
        </div>
      </section>
    </div>
  )
}

function ChangesTab({
  data,
  target,
  onClearTarget,
}: {
  data: PullRequestDetail
  target: { path: string; line: number } | null
  onClearTarget: () => void
}) {
  const [activePath, setActivePath] = useState<string | null>(data.files[0]?.path ?? null)

  if (data.files.length === 0) {
    return (
      <EmptyState
        icon={FileCode2}
        title="The diff is not stored for this pull request"
        description="The pipeline reads the diff from GitHub at review time and keeps the findings rather than the file contents. Open the pull request on GitHub to read the full change."
        action={
          <ButtonAnchor href={data.html_url} variant="primary" icon={ExternalLink}>
            Open on GitHub
          </ButtonAnchor>
        }
      />
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="h-fit overflow-hidden rounded-md border border-line lg:sticky lg:top-24">
        <p className="border-b border-line bg-raised px-4 py-2.5 text-sm font-semibold text-ink">
          {data.files.length} changed file{data.files.length === 1 ? '' : 's'}
        </p>
        <FileTree
          files={data.files}
          findings={data.findings}
          activePath={target?.path ?? activePath}
          onSelect={(path) => {
            setActivePath(path)
            document
              .getElementById(`file-${path}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
      </div>

      <div className="min-w-0">
        <CodeDiffViewer
          files={data.files}
          findings={data.findings}
          highlightedLine={target}
          onClearHighlight={onClearTarget}
        />
      </div>
    </div>
  )
}

function FindingsTab({
  findings,
  total,
  severityFilter,
  sourceFilter,
  onSeverity,
  onSource,
  counts,
  staticCount,
  aiCount,
  onJump,
}: {
  findings: Finding[]
  total: number
  severityFilter: Severity | 'all'
  sourceFilter: 'all' | 'static' | 'ai'
  onSeverity: (value: Severity | 'all') => void
  onSource: (value: 'all' | 'static' | 'ai') => void
  counts: Record<Severity, number>
  staticCount: number
  aiCount: number
  onJump: (path: string, line: number) => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterGroup
          label="Severity"
          value={severityFilter}
          onChange={(value) => onSeverity(value as Severity | 'all')}
          options={[
            { value: 'all', label: `All (${total})` },
            { value: 'error', label: `Critical (${counts.error})` },
            { value: 'warning', label: `Warnings (${counts.warning})` },
            { value: 'info', label: `Suggestions (${counts.info})` },
          ]}
        />
        <FilterGroup
          label="Source"
          value={sourceFilter}
          onChange={(value) => onSource(value as 'all' | 'static' | 'ai')}
          options={[
            { value: 'all', label: 'Both layers' },
            { value: 'static', label: `Static (${staticCount})` },
            { value: 'ai', label: `AI (${aiCount})` },
          ]}
        />
      </div>

      {findings.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={total === 0 ? 'No findings on this pull request' : 'Nothing matches these filters'}
          description={
            total === 0
              ? 'Both layers ran over the changed lines and neither raised anything.'
              : 'Widen the severity or source filter to see the rest of the findings.'
          }
        />
      ) : (
        <div className="space-y-2.5">
          {findings.map((finding, index) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              defaultOpen={index === 0}
              onJumpToLine={onJump}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricsTab({
  metrics,
  findings,
}: {
  metrics: QualityMetrics
  findings: Finding[]
}) {
  const complexityTone: MetricTone =
    metrics.cyclomatic_complexity > 10
      ? 'critical'
      : metrics.cyclomatic_complexity > 7
        ? 'warning'
        : 'success'

  const categories = findings.reduce<Record<string, number>>((totals, finding) => {
    totals[finding.category] = (totals[finding.category] ?? 0) + 1
    return totals
  }, {})

  return (
    <div className="space-y-7">
      <section>
        <h2 className="mb-4 text-lg font-semibold text-ink">Complexity and size</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Cyclomatic complexity"
            value={metrics.cyclomatic_complexity || '—'}
            icon={Ruler}
            tone={complexityTone}
            threshold="limit 10"
            ratio={metrics.cyclomatic_complexity / 20}
            note="The worst function this change touches. Each branch is a path a test has to cover."
          />
          <MetricCard
            label="Longest function"
            value={metrics.max_function_length || '—'}
            unit="lines"
            icon={Braces}
            tone={metrics.max_function_length > 50 ? 'warning' : 'success'}
            threshold="limit 50"
            ratio={metrics.max_function_length / 80}
            note="Measured from the syntax tree, not from the diff."
          />
          <MetricCard
            label="Functions changed"
            value={metrics.functions_changed}
            icon={Layers}
            tone="neutral"
            note="How much of the module this change reaches into."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-ink">Tests and documentation</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Test files changed"
            value={metrics.test_files_changed}
            icon={TestTube2}
            tone={metrics.test_files_changed > 0 ? 'success' : 'critical'}
            threshold={`${metrics.source_files_changed} source files`}
            ratio={
              metrics.source_files_changed
                ? metrics.test_files_changed / metrics.source_files_changed
                : 0
            }
            note={
              metrics.test_files_changed > 0
                ? 'The change comes with test coverage of its own.'
                : 'Source files changed with no accompanying test change.'
            }
          />
          <MetricCard
            label="Estimated coverage delta"
            value={signed(metrics.estimated_coverage_delta)}
            unit="pp"
            icon={Activity}
            tone={
              metrics.estimated_coverage_delta >= 0
                ? 'success'
                : metrics.estimated_coverage_delta > -3
                  ? 'warning'
                  : 'critical'
            }
            note="A heuristic from the ratio of tested to untested lines added, not a coverage run."
          />
          <MetricCard
            label="Documented definitions"
            value={percent(metrics.documented_ratio)}
            icon={FileText}
            tone={
              metrics.documented_ratio >= 0.8
                ? 'success'
                : metrics.documented_ratio >= 0.5
                  ? 'warning'
                  : 'critical'
            }
            threshold="target 80%"
            ratio={metrics.documented_ratio}
            note="Public functions and classes in the changed files that carry a docstring."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-ink">Consistency</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Naming violations"
            value={metrics.naming_violations}
            icon={BadgeCheck}
            tone={metrics.naming_violations === 0 ? 'success' : 'warning'}
            note="Definitions that do not follow the language's snake_case or PascalCase convention."
          />
          <MetricCard
            label="Duplication"
            value={percent(metrics.duplication_ratio)}
            icon={Layers}
            tone={
              metrics.duplication_ratio < 0.1
                ? 'success'
                : metrics.duplication_ratio < 0.2
                  ? 'warning'
                  : 'critical'
            }
            threshold="target under 10%"
            ratio={metrics.duplication_ratio * 3}
            note="Added lines that repeat another added line in the same change."
          />
          <MetricCard
            label="Findings per file"
            value={
              metrics.source_files_changed
                ? (findings.length / metrics.source_files_changed).toFixed(1)
                : '—'
            }
            icon={MessageSquareCode}
            tone={findings.length / Math.max(metrics.source_files_changed, 1) > 4 ? 'warning' : 'neutral'}
            note="Density, so a large change is not penalised for being large."
          />
        </div>
      </section>

      {Object.keys(categories).length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-ink">Findings by category</h2>
          <div className="space-y-2.5">
            {Object.entries(categories)
              .sort(([, a], [, b]) => b - a)
              .map(([category, count]) => (
                <div key={category} className="flex items-center gap-4">
                  <span className="w-36 shrink-0 text-sm capitalize text-ink-soft">{category}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(count / findings.length) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums text-ink">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AiTab({
  data,
  findings,
  onJump,
}: {
  data: PullRequestDetail
  findings: Finding[]
  onJump: (path: string, line: number) => void
}) {
  if (!data.ai_used) {
    return (
      <EmptyState
        icon={Bot}
        title="The AI layer did not run for this review"
        description="Either no API key is configured, or the provider is set to mock. Static analysis still ran and its findings are on the Findings tab."
        action={<ButtonLink to="/app/settings" variant="primary">Check the AI configuration</ButtonLink>}
      />
    )
  }

  return (
    <div className="space-y-7">
      <section className="rounded-md border border-accent/25 bg-accent/[0.06] p-5">
        <h2 className="mb-2.5 flex items-center gap-2 text-lg font-semibold text-ink">
          <Bot className="h-5 w-5 text-accent" aria-hidden />
          The model's reading of this change
        </h2>
        <p className="whitespace-pre-line text-base leading-relaxed text-ink-soft">
          {data.summary || 'The model returned no summary for this review.'}
        </p>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">
            Contextual findings ({findings.length})
          </h2>
          <Badge tone="accent" icon={Bot}>
            Not expressible as a rule
          </Badge>
        </div>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-ink-muted">
          These are the findings the static layer cannot produce: they depend on what the code
          means rather than on a pattern it matches. Each one is the model's judgement, so treat it
          as a reviewer's opinion to verify, not as a rule that fired.
        </p>

        {findings.length === 0 ? (
          <p className="text-sm text-ink-muted">
            The model read the diff and raised no findings of its own.
          </p>
        ) : (
          <div className="space-y-2.5">
            {findings.map((finding, index) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                defaultOpen={index === 0}
                onJumpToLine={onJump}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="label-caps">{label}</span>
      <div className="flex flex-wrap gap-1 rounded-md border border-line bg-sunken p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              'rounded px-2.5 py-1.5 text-sm font-medium transition-colors',
              value === option.value
                ? 'bg-accent text-accent-ink'
                : 'text-ink-muted hover:bg-raised hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Checklist({
  data,
  counts,
}: {
  data: PullRequestDetail
  counts: Record<Severity, number>
}) {
  const items = [
    { label: 'No blocking findings', ok: counts.error === 0 },
    { label: 'Tests accompany the change', ok: data.metrics.test_files_changed > 0 },
    { label: 'Complexity within limits', ok: data.metrics.cyclomatic_complexity <= 10 },
    { label: 'Public definitions documented', ok: data.metrics.documented_ratio >= 0.8 },
    { label: 'No naming violations', ok: data.metrics.naming_violations === 0 },
    { label: 'Review posted to GitHub', ok: data.posted },
  ]

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3 px-5 py-3">
          {item.ok ? (
            <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success" aria-hidden />
          ) : (
            <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-warning" aria-hidden />
          )}
          <span className={cn('text-sm', item.ok ? 'text-ink-soft' : 'text-ink')}>
            {item.label}
          </span>
          <span
            className={cn(
              'ml-auto font-mono text-xs font-semibold',
              item.ok ? 'text-success' : 'text-warning',
            )}
          >
            {item.ok ? 'pass' : 'check'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The path this review took, so the pipeline is visible rather than implied. */
function PipelineTrace({
  data,
  staticCount,
  aiCount,
}: {
  data: PullRequestDetail
  staticCount: number
  aiCount: number
}) {
  const steps = [
    { label: 'Webhook verified', detail: 'HMAC-SHA256 signature checked', done: true },
    { label: 'Diff fetched', detail: `${data.files_reviewed} changed files`, done: true },
    { label: 'Static analysis', detail: `${staticCount} findings`, done: true },
    {
      label: 'AI review',
      detail: data.ai_used ? `${aiCount} findings` : 'skipped',
      done: data.ai_used,
    },
    {
      label: 'Merged and capped',
      detail: `${data.findings.length} findings kept`,
      done: true,
    },
    {
      label: 'Posted to GitHub',
      detail: data.posted ? 'one review, inline comments' : 'not posted',
      done: data.posted,
    },
  ]

  return (
    <ol className="px-5 py-4">
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex gap-3.5 pb-4 last:pb-0">
          {index < steps.length - 1 && (
            <span
              className="absolute left-[7px] top-5 h-full w-px bg-line"
              aria-hidden
            />
          )}
          <span
            className={cn(
              'relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2',
              step.done ? 'border-success bg-success/25' : 'border-line-strong bg-sunken',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <p className={cn('text-sm font-medium', step.done ? 'text-ink' : 'text-ink-muted')}>
              {step.label}
            </p>
            <p className="font-mono text-xs text-ink-muted">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function countSeverities(findings: Finding[]): Record<Severity, number> {
  return findings.reduce(
    (totals, finding) => {
      totals[finding.severity] += 1
      return totals
    },
    { error: 0, warning: 0, info: 0 } as Record<Severity, number>,
  )
}

function verdictFor(data: PullRequestDetail, counts: Record<Severity, number>): string {
  if (data.status === 'reviewing' || data.status === 'queued') {
    return 'The pipeline is still working through this pull request.'
  }

  if (data.status === 'failed') {
    return 'The review did not finish. The queue will retry it.'
  }

  if (counts.error > 0) {
    return `${counts.error} blocking finding${counts.error > 1 ? 's' : ''} must be resolved before this merges.`
  }

  if (counts.warning > 0) {
    return `No blocking issues, but ${counts.warning} warning${counts.warning > 1 ? 's' : ''} are worth a second look.`
  }

  return 'Nothing blocking. The changed lines pass every rule and the AI layer raised no concerns.'
}
