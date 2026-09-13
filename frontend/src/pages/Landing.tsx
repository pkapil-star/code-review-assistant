/**
 * The landing page.
 *
 * It has one job: make a reader understand, within a few seconds, that pull
 * requests are analysed automatically by two layers and that the result goes
 * back to GitHub. The sample review below the fold does more of that work than
 * any amount of copy, so it is shown early and shown real.
 */

import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  BookOpen,
  CheckCircle2,
  FileText,
  GitPullRequest,
  MessagesSquare,
  Ruler,
  ScanLine,
  ShieldAlert,
  TestTube2,
  TriangleAlert,
} from 'lucide-react'
import type { IconComponent } from '@/components/ui/icons'
import { Github } from '@/components/ui/icons'
import { PublicFooter, PublicNav } from '@/components/marketing/PublicChrome'
import { PipelineDiagram } from '@/components/marketing/Pipeline'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { Badge, SeverityBadge, SourceBadge } from '@/components/ui/Badge'
import { ReviewScore } from '@/components/ui/ReviewScore'
import { useApi } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

const FEATURES: { icon: IconComponent; title: string; body: string }[] = [
  {
    icon: ScanLine,
    title: 'Static analysis',
    body: 'Diff-level rules on every language and syntax-tree rules on Python. Secrets, debug leftovers, bare excepts and mutable defaults, caught before a human reads the change.',
  },
  {
    icon: Bot,
    title: 'AI contextual review',
    body: 'The model reads the same diff for the problems a rule cannot express: a retry that double-charges, an access check that runs after its query, a conversion that truncates money.',
  },
  {
    icon: Ruler,
    title: 'Complexity metrics',
    body: 'Cyclomatic complexity, function length and parameter counts measured from the syntax tree, each reported against the threshold it is judged by.',
  },
  {
    icon: TestTube2,
    title: 'Test and coverage insight',
    body: 'A change that touches source files and no test files is flagged. It is the comment a senior engineer repeats most, so the tool repeats it instead.',
  },
  {
    icon: CheckCircle2,
    title: 'Naming and style checks',
    body: 'snake_case functions, PascalCase classes, documented public definitions, line length. Small things, consistently applied, so review time goes to the large ones.',
  },
  {
    icon: MessagesSquare,
    title: 'Inline GitHub feedback',
    body: 'One review, anchored to the lines it is about, posted through the App installation. One notification for the author, not one per finding.',
  },
]

export default function Landing() {
  const { data: status } = useApi(() => api.status(), [])

  return (
    <div className="min-h-screen bg-canvas">
      <PublicNav />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.55]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent/[0.09] to-transparent"
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-[96rem] px-4 py-20 lg:px-8 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div className="max-w-2xl">
              <Badge tone="accent" icon={Github} size="lg">
                GitHub App · pull request review
              </Badge>

              <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl xl:text-6xl">
                AI-powered code reviews,
                <span className="block text-ink-muted">
                  before your team spends the time.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
                Every pull request is analysed the moment it opens. Rule-based static analysis
                catches what a pattern can catch; an AI layer reads the same diff for what it
                cannot. The combined review is posted back to GitHub as inline comments, on the
                lines it is about.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                <ButtonLink to="/app" variant="primary" size="lg" iconRight={ArrowRight}>
                  View dashboard
                </ButtonLink>
                <ButtonLink to="/docs" size="lg" icon={BookOpen}>
                  How it works
                </ButtonLink>
              </div>

              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-7">
                <HeroFigure value="2" label="Review layers" />
                <HeroFigure value="15" label="Static rules" />
                <HeroFigure
                  value={status?.connected ? 'Live' : 'Ready'}
                  label={status?.connected ? 'GitHub connected' : 'Awaiting install'}
                />
              </dl>
            </div>

            <SampleReview />
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-b border-line py-20">
        <div className="mx-auto w-full max-w-[96rem] px-4 lg:px-8">
          <SectionHeading
            eyebrow="The pipeline"
            title="From a pull request to inline feedback"
            description="Six stages, each of which either produces a finding or gets out of the way. Nothing waits on a person until the last one."
          />
          <div className="mt-12">
            <PipelineDiagram />
          </div>
        </div>
      </section>

      {/* Two layers */}
      <section className="border-b border-line py-20">
        <div className="mx-auto w-full max-w-[96rem] px-4 lg:px-8">
          <SectionHeading
            eyebrow="Why two layers"
            title="Rules are exact. Models understand meaning."
            description="Neither is sufficient alone, and the difference between them is the product."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <LayerCard
              icon={ScanLine}
              tone="neutral"
              title="Static analysis"
              subtitle="Deterministic, free, instant"
              strengths={[
                'Same answer every time, so a finding can be trusted without checking it',
                'Costs nothing per pull request and finishes in milliseconds',
                'Points at an exact line, because it found an exact pattern',
              ]}
              limit="Cannot tell whether a retry loop is safe. It has no idea what the code is for."
            />
            <LayerCard
              icon={Bot}
              tone="accent"
              title="AI review"
              subtitle="Contextual, judgemental, priced per review"
              strengths={[
                'Reads intent: an idempotency key accepted and never forwarded',
                'Connects two files: a gateway timeout longer than its caller allows',
                'Explains why a finding matters, not only that a pattern matched',
              ]}
              limit="Occasionally wrong, and always worth verifying. Every finding says it came from the model."
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-line py-20">
        <div className="mx-auto w-full max-w-[96rem] px-4 lg:px-8">
          <SectionHeading
            eyebrow="What it checks"
            title="The review a senior engineer keeps having to repeat"
            description="Everything below runs on every pull request, on the added lines only, so untouched code is never commented on."
          />

          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 xl:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="bg-surface p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-md border border-line-strong bg-raised text-accent">
                  <feature.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-ink-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="border-b border-line py-20">
        <div className="mx-auto w-full max-w-[96rem] px-4 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading
                align="left"
                eyebrow="Architecture"
                title="Built to answer GitHub in milliseconds"
                description="GitHub retries a delivery that does not answer quickly, and a full review takes tens of seconds. So the webhook endpoint does three things and returns."
              />

              <ol className="mt-8 space-y-5">
                <ArchStep
                  index={1}
                  title="Verify the signature"
                  body="HMAC-SHA256 over the raw body, compared in constant time. An unverified delivery is rejected before it is parsed."
                />
                <ArchStep
                  index={2}
                  title="Enqueue the job"
                  body="An async queue, backed by memory in development and Redis in production, where jobs survive a restart."
                />
                <ArchStep
                  index={3}
                  title="Answer 200 and return"
                  body="Workers drain the queue in the background, retrying with backoff when the GitHub or model API fails transiently."
                />
              </ol>

              <div className="mt-9">
                <ButtonLink to="/docs#architecture" iconRight={ArrowRight}>
                  Read the architecture
                </ButtonLink>
              </div>
            </div>

            <Panel>
              <PanelHeader title="Request path" icon={GitPullRequest} />
              <PanelBody flush>
                <pre className="overflow-x-auto p-5 font-mono text-[0.8125rem] leading-relaxed text-ink-soft">
                  <code>{`POST /webhooks/github
  ├─ verify_webhook_signature(body, header)   → 401 on mismatch
  ├─ parse_pull_request_event(payload)        → 400 on malformed
  ├─ event.should_review()                    → 200 "ignored" for drafts
  └─ queue.enqueue(ReviewJob)                 → 200 {"status": "queued"}

worker
  ├─ GitHubClient.for_installation(id)
  ├─ list_pull_request_files()                 diff + added lines
  ├─ run_static_analysis(files, sources)       rule findings
  ├─ review_with_ai(title, files)              contextual findings
  ├─ deduplicate → sort → cap
  └─ create_review(body, comments)             one review, inline`}</code>
                </pre>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto w-full max-w-[96rem] px-4 lg:px-8">
          <Panel className="overflow-hidden">
            <div className="relative px-8 py-14 text-center">
              <div
                className="grid-backdrop pointer-events-none absolute inset-0 opacity-40"
                aria-hidden
              />
              <div className="relative">
                <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                  Open the dashboard
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-lg leading-relaxed text-ink-muted">
                  Review activity, findings by severity, quality trends, and the full diff beside
                  the findings for every analysed pull request.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
                  <ButtonLink to="/app" variant="primary" size="lg" iconRight={ArrowRight}>
                    View dashboard
                  </ButtonLink>
                  <ButtonLink to="/app/pull-requests/pr-2481" size="lg" icon={FileText}>
                    See a full review
                  </ButtonLink>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}

/**
 * A real finding from a real review, rendered with the same components the
 * dashboard uses. Showing the product beats describing it.
 */
function SampleReview() {
  return (
    <Panel className="overflow-hidden lg:justify-self-end lg:shadow-lifted">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-raised px-5 py-3.5">
        <span className="font-mono text-sm text-ink-muted">northwind/payments-api</span>
        <span className="font-mono text-sm text-ink">#2481</span>
        <Badge tone="critical" icon={TriangleAlert} size="sm" className="ml-auto">
          Critical
        </Badge>
      </header>

      <div className="flex items-center gap-5 border-b border-line px-5 py-5">
        <ReviewScore score={41} size="md" />
        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug text-ink">
            Add multi-currency support and retries to ChargeService
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-muted">
            <span className="text-critical">2 critical</span>
            <span className="text-warning">7 warnings</span>
            <span className="text-accent">7 suggestions</span>
          </p>
        </div>
      </div>

      <div className="space-y-2.5 p-4">
        <SampleFinding
          severity="error"
          source="static"
          rule="possible-secret"
          path="app/billing/charges.py:22"
          title="Possible hard-coded secret"
          body="A live Stripe secret key is committed as a class attribute. It stays in the git history after the line is deleted, so the credential has to be rotated."
        />
        <SampleFinding
          severity="error"
          source="ai"
          rule="ai-idempotency"
          path="app/billing/charges.py:38"
          title="Retry can double-charge a customer"
          body="The retry loop accepts an idempotency_key and never forwards it. If the first attempt reaches Stripe and the response is lost, the retry creates a second live charge."
        />
      </div>

      <footer className="border-t border-line px-5 py-3.5">
        <Link
          to="/app/pull-requests/pr-2481"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Open the full review
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </footer>
    </Panel>
  )
}

function SampleFinding({
  severity,
  source,
  rule,
  path,
  title,
  body,
}: {
  severity: 'error' | 'warning' | 'info'
  source: 'static' | 'ai'
  rule: string
  path: string
  title: string
  body: string
}) {
  return (
    <article
      className={cn(
        'rounded-md border border-l-[3px] border-line bg-sunken p-3.5',
        severity === 'error' ? 'border-l-critical' : 'border-l-warning',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={severity} size="sm" />
        <SourceBadge source={source} />
        <span className="ml-auto font-mono text-xs text-ink-muted">{rule}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      <p className="mt-2 font-mono text-xs text-accent">{path}</p>
    </article>
  )
}

function HeroFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-mono text-3xl font-semibold tabular-nums text-ink">{value}</dd>
      <dd className="mt-1 text-sm text-ink-muted">{label}</dd>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow: string
  title: string
  description: string
  align?: 'center' | 'left'
}) {
  return (
    <div className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center')}>
      <p className="label-caps">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-ink-muted">{description}</p>
    </div>
  )
}

function LayerCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  strengths,
  limit,
}: {
  icon: IconComponent
  tone: 'neutral' | 'accent'
  title: string
  subtitle: string
  strengths: string[]
  limit: string
}) {
  return (
    <Panel className="flex flex-col">
      <PanelBody className="flex-1 p-7">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-md border',
            tone === 'accent'
              ? 'border-accent/40 bg-accent/12 text-accent'
              : 'border-line-strong bg-raised text-ink-muted',
          )}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </span>

        <h3 className="mt-5 text-xl font-semibold text-ink">{title}</h3>
        <p className="mt-1 font-mono text-sm text-ink-muted">{subtitle}</p>

        <ul className="mt-6 space-y-3">
          {strengths.map((item) => (
            <li key={item} className="flex gap-3 text-base leading-relaxed text-ink-soft">
              <CheckCircle2
                className={cn(
                  'mt-1 h-[18px] w-[18px] shrink-0',
                  tone === 'accent' ? 'text-accent' : 'text-success',
                )}
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      </PanelBody>

      <footer className="flex gap-3 border-t border-line px-7 py-5">
        <ShieldAlert className="mt-0.5 h-[18px] w-[18px] shrink-0 text-warning" aria-hidden />
        <p className="text-sm leading-relaxed text-ink-muted">{limit}</p>
      </footer>
    </Panel>
  )
}

function ArchStep({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised font-mono text-sm font-semibold text-accent">
        {index}
      </span>
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-base leading-relaxed text-ink-muted">{body}</p>
      </div>
    </li>
  )
}
