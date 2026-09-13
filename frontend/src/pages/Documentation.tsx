/**
 * Documentation.
 *
 * Reachable both publicly at /docs and inside the shell at /app/docs, so the
 * `embedded` prop drops the public header and footer when it is rendered inside
 * the application frame.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Boxes,
  FileCode2,
  GitPullRequest,
  ListChecks,
  ScanLine,
  ShieldCheck,
  Terminal,
  Webhook,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { SeverityBadge } from '@/components/ui/Badge'
import { PipelineDiagram } from '@/components/marketing/Pipeline'
import { PublicNav, PublicFooter } from '@/components/marketing/PublicChrome'
import { useApi } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { RuleMeta } from '@/types'

const SECTIONS = [
  { id: 'overview', label: 'What the system does' },
  { id: 'webhooks', label: 'GitHub webhooks' },
  { id: 'static', label: 'Static analysis layer' },
  { id: 'ai', label: 'AI review layer' },
  { id: 'pipeline', label: 'The review pipeline' },
  { id: 'rules', label: 'Supported checks' },
  { id: 'feedback', label: 'How feedback reaches GitHub' },
  { id: 'architecture', label: 'Project architecture' },
  { id: 'running', label: 'Running it locally' },
]

export default function Documentation({ embedded = false }: { embedded?: boolean }) {
  const [active, setActive] = useState('overview')
  const rules = useApi<RuleMeta[]>(() => api.rules(), [])

  // Highlight the section currently nearest the top of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-96px 0px -66% 0px' },
    )

    SECTIONS.forEach(({ id }) => {
      const node = document.getElementById(id)
      if (node) observer.observe(node)
    })

    return () => observer.disconnect()
  }, [])

  const byLayer = {
    diff: (rules.data ?? []).filter((rule) => rule.layer === 'diff'),
    ast: (rules.data ?? []).filter((rule) => rule.layer === 'ast'),
    'pull-request': (rules.data ?? []).filter((rule) => rule.layer === 'pull-request'),
  }

  const body = (
    <div className="mx-auto w-full max-w-[96rem] px-4 py-9 lg:px-8">
      <PageHeader
        eyebrow="Documentation"
        title="How ReviewPilot works"
        description="The pipeline from a GitHub pull request to inline review comments, and every check it runs on the way."
      />

      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="h-fit lg:sticky lg:top-24">
          <p className="label-caps mb-3">On this page</p>
          <ul className="space-y-0.5 border-l border-line">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={cn(
                    '-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors',
                    active === section.id
                      ? 'border-accent font-semibold text-ink'
                      : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink-soft',
                  )}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 max-w-4xl space-y-12">
          <Section id="overview" title="What the system does" icon={GitPullRequest}>
            <p>
              ReviewPilot is a GitHub App. When a pull request is opened or pushed to, GitHub sends
              a webhook, the service verifies it, and a background worker reviews the change. The
              review is posted back to the pull request as one set of inline comments.
            </p>
            <p>
              It runs two layers over the same diff, and the distinction is the point of the
              product. The <strong className="font-semibold text-ink">static layer</strong> is
              rule-based: exact, free, instant, and only able to see patterns. The{' '}
              <strong className="font-semibold text-ink">AI layer</strong> reads what the code
              means: slower, priced per review, occasionally wrong, and the only one of the two
              that can notice a retry loop capable of double-charging a customer.
            </p>
            <p>
              Running both means the cheap checks never reach a human, and the expensive layer is
              spent only on what rules cannot decide.
            </p>
          </Section>

          <Section id="webhooks" title="GitHub webhooks" icon={Webhook}>
            <p>
              GitHub signs every delivery with the App's webhook secret. The endpoint recomputes
              that HMAC-SHA256 signature over the raw body and compares it in constant time before
              parsing anything. A delivery that does not verify is answered{' '}
              <Code>401</Code> and dropped.
            </p>
            <CodeBlock>{`POST /webhooks/github
X-Hub-Signature-256: sha256=<hmac of the raw body>
X-GitHub-Event: pull_request
X-GitHub-Delivery: <uuid>`}</CodeBlock>
            <p>
              Only the <Code>pull_request</Code> event is reviewed, and only for the actions{' '}
              <Code>opened</Code>, <Code>reopened</Code>, <Code>synchronize</Code> and{' '}
              <Code>ready_for_review</Code>. Drafts are skipped. Anything else is answered{' '}
              <Code>200</Code> with a reason, because a webhook that returns an error gets retried.
            </p>
            <p>
              The handler enqueues a job and returns immediately. A full review takes tens of
              seconds and GitHub times a delivery out long before that, so no review work happens
              inside the request.
            </p>
          </Section>

          <Section id="static" title="Static analysis layer" icon={ScanLine}>
            <p>Two kinds of rule run, over different inputs.</p>
            <p>
              <strong className="font-semibold text-ink">Diff rules</strong> read the added lines
              as text. They catch long lines, new TODO markers, leftover debug statements and
              anything that looks like a committed secret. They need no parser, so they work on
              every language the pull request touches.
            </p>
            <p>
              <strong className="font-semibold text-ink">Syntax-tree rules</strong> parse the whole
              Python file at the head commit and walk its AST. That is how complexity, function
              length, parameter counts, bare excepts and mutable default arguments are measured:
              none of them are visible in a diff fragment.
            </p>
            <p>
              Whole-file analysis sees pre-existing problems too, so findings are filtered back
              down to lines this pull request actually added. Commenting on untouched code annoys
              the author and gets the whole review ignored.
            </p>
          </Section>

          <Section id="ai" title="AI review layer" icon={Bot}>
            <p>
              The diff is rebuilt into readable form, truncated at the configured byte budget, and
              sent to the model with the pull request title for context. The model answers with
              structured findings, each carrying a path, a line, a severity and an explanation.
            </p>
            <p>
              Findings that name a line outside the diff are dropped, and anything the static layer
              already reported on the same line with the same rule is deduplicated away. The
              author should see each problem once.
            </p>
            <p>
              The layer is optional. With no API key configured, or with{' '}
              <Code>AI_PROVIDER=mock</Code>, the pipeline runs with static analysis alone rather
              than failing.
            </p>
          </Section>

          <Section id="pipeline" title="The review pipeline" icon={Boxes}>
            <p>End to end, for one pull request:</p>
            <div className="not-prose my-6">
              <PipelineDiagram compact />
            </div>
            <ol className="ml-5 list-decimal space-y-2">
              <li>List the files the pull request changed, following pagination past 100 files.</li>
              <li>Fetch the full source of the Python files, which the syntax-tree rules need.</li>
              <li>Run every static rule and filter the findings to the added lines.</li>
              <li>Ask the model for the findings rules cannot express.</li>
              <li>Merge both sets, deduplicate, sort worst-first, and cap the list.</li>
              <li>Post one review carrying every anchored comment.</li>
            </ol>
            <p>
              A job that throws is retried with a backoff proportional to the attempt number. The
              two things most likely to fail here, the GitHub API and the model API, both fail
              transiently.
            </p>
          </Section>

          <Section id="rules" title="Supported checks" icon={ListChecks}>
            <p>
              Read from the running service, so this list cannot drift from what the analyser
              implements.
            </p>

            {rules.initialising ? (
              <div className="skeleton not-prose h-64 rounded-md" />
            ) : (
              <div className="not-prose mt-6 space-y-6">
                <RuleGroup
                  title="Diff rules"
                  caption="Text-level checks on the added lines. Any language."
                  rules={byLayer.diff}
                />
                <RuleGroup
                  title="Syntax-tree rules"
                  caption="Parsed from the Python file at the head commit."
                  rules={byLayer.ast}
                />
                <RuleGroup
                  title="Whole pull request"
                  caption="Checks that need to see the change as a whole."
                  rules={byLayer['pull-request']}
                />
              </div>
            )}
          </Section>

          <Section id="feedback" title="How feedback reaches GitHub" icon={GitPullRequest}>
            <p>
              Everything is posted as a single review rather than one comment per finding. One
              review keeps the pull request timeline readable and sends the author one
              notification instead of fifteen.
            </p>
            <p>
              Findings that name a line carry an inline comment on that line. Findings with no line,
              such as "this pull request adds no tests", cannot be anchored, so they appear in the
              review body instead of being dropped.
            </p>
            <p>
              GitHub rejects an entire review when one comment points at a line outside the diff.
              If that happens, the service falls back to posting the same body as a plain
              conversation comment, so the author still sees the findings.
            </p>
            <CodeBlock>{`POST /repos/{owner}/{repo}/pulls/{number}/reviews
{
  "body": "## Automated code review …",
  "event": "COMMENT",
  "commit_id": "<head sha>",
  "comments": [
    { "path": "app/billing/charges.py", "line": 22, "side": "RIGHT", "body": "…" }
  ]
}`}</CodeBlock>
            <p>
              The event is always <Code>COMMENT</Code>, never <Code>APPROVE</Code> or{' '}
              <Code>REQUEST_CHANGES</Code>. An automated approval carries a weight the tool has not
              earned, and a blocking review from a bot stops a team from shipping when the tool is
              wrong.
            </p>
          </Section>

          <Section id="architecture" title="Project architecture" icon={FileCode2}>
            <CodeBlock>{`app/
  main.py            FastAPI app, worker lifecycle, serves the built frontend
  config.py          Settings, read from the environment or .env
  routers/
    webhooks.py      POST /webhooks/github — verify, then enqueue
    api.py           GET /api/* — the read API this dashboard uses
  security/
    webhook.py       Constant-time HMAC-SHA256 verification
  models/
    events.py        The pull_request payload, narrowed to what we use
    review.py        ReviewComment, ReviewResult, Severity
  analysis/
    diff.py          Unified-diff parsing, added-line tracking
    generic_rules.py Text rules over added lines
    python_rules.py  AST rules over whole files
    static.py        Runs the rules, deduplicates, sorts
  ai/
    providers.py     The LLM provider interface, plus a mock
    reviewer.py      Prompt, response parsing, line validation
  github/
    auth.py          App JWT to installation token
    client.py        List files, read a file, post the review
  queue/
    worker.py        Async queue and workers, memory or Redis
    jobs.py          ReviewJob and queue counters
  store/
    records.py       The read model the dashboard renders
    memory.py        In-process store, one lock, one swap point for a database
  pipeline.py        The whole review, start to finish

frontend/
  src/lib/api.ts     Every call the browser makes to the service
  src/components/    Reusable UI: shell, review, charts, primitives
  src/pages/         One file per route`}</CodeBlock>
            <p>
              The store is deliberately the only place reviews are kept. Putting Postgres behind
              this is a change to <Code>app/store/memory.py</Code> and nothing else.
            </p>
          </Section>

          <Section id="running" title="Running it locally" icon={Terminal}>
            <p>Backend, from the repository root:</p>
            <CodeBlock>{`python -m venv venv
venv\\Scripts\\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # then fill it in
uvicorn app.main:app --reload`}</CodeBlock>

            <p>Frontend, in a second terminal:</p>
            <CodeBlock>{`cd frontend
npm install
npm run dev                     # http://localhost:5173, proxies /api to :8000`}</CodeBlock>

            <p>
              For a single-origin build, run <Code>npm run build</Code> in{' '}
              <Code>frontend/</Code> and start the API on its own: FastAPI serves{' '}
              <Code>frontend/dist</Code> at the root and the dashboard lives at{' '}
              <Code>http://localhost:8000</Code>.
            </p>

            <p>
              To point GitHub at a local machine, tunnel the port and set the App's webhook URL to
              the tunnel's <Code>/webhooks/github</Code>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )

  if (embedded) return body

  return (
    <div className="min-h-screen bg-canvas">
      <PublicNav />
      {body}
      <PublicFooter />
    </div>
  )
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string
  title: string
  icon: typeof Bot
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 flex items-center gap-2.5 text-2xl font-bold tracking-tight text-ink">
        <Icon className="h-6 w-6 text-accent" aria-hidden />
        {title}
      </h2>
      <div className="space-y-4 text-base leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

function RuleGroup({
  title,
  caption,
  rules,
}: {
  title: string
  caption: string
  rules: RuleMeta[]
}) {
  if (rules.length === 0) return null

  return (
    <Panel>
      <PanelHeader title={`${title} (${rules.length})`} description={caption} icon={ShieldCheck} />
      <PanelBody flush>
        <ul className="divide-y divide-line">
          {rules.map((rule) => (
            <li key={rule.rule} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={rule.default_severity} size="sm" />
                <code className="font-mono text-sm font-semibold text-ink">{rule.rule}</code>
                <span className="ml-auto font-mono text-xs text-ink-muted">
                  {rule.languages.join(', ')}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{rule.description}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{rule.why_it_matters}</p>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[0.875em] text-ink">
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="not-prose overflow-x-auto rounded-md border border-line bg-sunken p-4 font-mono text-[0.8125rem] leading-relaxed text-ink-soft">
      <code>{children}</code>
    </pre>
  )
}

/** Kept so the docs page can link on to the dashboard from its last section. */
export function DocsCta() {
  return (
    <Link
      to="/app"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
    >
      Open the dashboard
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  )
}
