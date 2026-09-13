/**
 * Settings.
 *
 * The service reads its configuration from environment variables at start-up,
 * so most of this page is a read-only view of what the process is actually
 * running with. That is deliberate: a browser form that silently disagreed with
 * the running configuration would be worse than no form at all.
 *
 * Secrets are never sent to the browser. The API reports only whether each one
 * is configured, and this page shows that as a status, never a value.
 */

import { useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  KeyRound,
  ListChecks,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Webhook,
  XCircle,
} from 'lucide-react'
import { Github } from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge, SeverityBadge } from '@/components/ui/Badge'
import { ReadOnlyRow, Toggle } from '@/components/ui/Form'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { ErrorState, PageSkeleton } from '@/components/ui/States'
import { useApi } from '@/hooks/useApi'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { RuleMeta, ServiceSettings } from '@/types'

type TabId = 'github' | 'review' | 'ai' | 'rules' | 'notifications' | 'account'

export default function Settings() {
  const [tab, setTab] = useState<TabId>('github')
  const { push } = useToast()

  const settings = useApi<ServiceSettings>(() => api.settings(), [])
  const rules = useApi<RuleMeta[]>(() => api.rules(), [])

  // Notification preferences have no backend yet, so they live in the browser
  // and say so rather than pretending to be saved on the server.
  const [notifications, setNotifications] = useState({
    critical: true,
    weekly: false,
    failures: true,
  })

  if (settings.initialising) return <PageSkeleton />
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.refetch} />
  if (!settings.data) return null

  const config = settings.data

  const tabs: TabItem<TabId>[] = [
    { id: 'github', label: 'GitHub', icon: Github },
    { id: 'review', label: 'Review behaviour', icon: SlidersHorizontal },
    { id: 'ai', label: 'AI layer', icon: Bot },
    { id: 'rules', label: 'Static rules', icon: ScanLine, count: rules.data?.length },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'account', label: 'Account', icon: User },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Service configuration"
        description="What the running process is configured with. Values come from environment variables; secrets are reported as configured or missing and never sent to the browser."
        actions={
          <Button icon={RefreshCw} onClick={settings.refetch}>
            Reload
          </Button>
        }
      />

      <Panel>
        <Tabs items={tabs} value={tab} onChange={setTab} className="px-2" />

        <div className="p-5">
          {tab === 'github' && <GitHubTab config={config} />}
          {tab === 'review' && <ReviewTab config={config} />}
          {tab === 'ai' && <AiTab config={config} />}
          {tab === 'rules' && (
            <RulesTab rules={rules.data ?? []} loading={rules.initialising} />
          )}
          {tab === 'notifications' && (
            <NotificationsTab
              value={notifications}
              onChange={(next) => {
                setNotifications(next)
                push({
                  tone: 'info',
                  title: 'Saved in this browser',
                  description:
                    'Notification delivery is not implemented in the service yet, so the preference is kept locally.',
                })
              }}
            />
          )}
          {tab === 'account' && <AccountTab config={config} />}
        </div>
      </Panel>
    </>
  )
}

function StatusRow({
  label,
  configured,
  hint,
  required = true,
}: {
  label: string
  configured: boolean
  hint: string
  required?: boolean
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{hint}</p>
      </div>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1.5 font-mono text-sm font-semibold',
          configured ? 'text-success' : required ? 'text-critical' : 'text-warning',
        )}
      >
        {configured ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        ) : (
          <XCircle className="h-4 w-4" aria-hidden />
        )}
        {configured ? 'configured' : 'not set'}
      </span>
    </div>
  )
}

function GitHubTab({ config }: { config: ServiceSettings }) {
  const connected =
    config.github_app_id_configured &&
    config.github_webhook_secret_configured &&
    config.github_private_key_configured

  return (
    <div className="space-y-7">
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-ink">GitHub App integration</h2>
          {connected ? (
            <Badge tone="success" icon={CheckCircle2}>
              Connected
            </Badge>
          ) : (
            <Badge tone="warning" icon={AlertTriangle}>
              Incomplete
            </Badge>
          )}
        </div>

        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-muted">
          The service authenticates as a GitHub App installation. It signs a JWT with the private
          key, exchanges it for a short-lived installation token, and uses that token to read the
          diff and post the review. No personal access token is involved, and no user credential is
          stored.
        </p>

        <div className="divide-y divide-line rounded-md border border-line px-5">
          <StatusRow
            label="App id"
            configured={config.github_app_id_configured}
            hint="GITHUB_APP_ID — identifies the App when signing the JWT."
          />
          <StatusRow
            label="Webhook secret"
            configured={config.github_webhook_secret_configured}
            hint="GITHUB_WEBHOOK_SECRET — every delivery is rejected unless its HMAC-SHA256 signature matches."
          />
          <StatusRow
            label="Private key"
            configured={config.github_private_key_configured}
            hint="GITHUB_PRIVATE_KEY_PATH — the PEM file the App signs with. Kept on disk, never read by the browser."
          />
          <ReadOnlyRow
            label="GitHub API base URL"
            value={config.github_api_url}
            hint="Change this only for GitHub Enterprise."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink">
          <Webhook className="h-5 w-5 text-ink-muted" aria-hidden />
          Webhook endpoint
        </h2>
        <div className="rounded-md border border-line bg-sunken p-5">
          <p className="label-caps mb-2">Point the App's webhook here</p>
          <code className="block overflow-x-auto whitespace-nowrap font-mono text-base text-accent">
            POST https://your-host/webhooks/github
          </code>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-muted">
            <li>
              Content type <code className="font-mono text-ink-soft">application/json</code>.
            </li>
            <li>
              Subscribe to the <code className="font-mono text-ink-soft">pull_request</code> event
              only. Everything else is answered and ignored.
            </li>
            <li>
              A delivery whose signature does not verify is answered{' '}
              <code className="font-mono text-critical">401</code> before its body is parsed.
            </li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink">
          <ShieldCheck className="h-5 w-5 text-ink-muted" aria-hidden />
          Security
        </h2>
        <ul className="space-y-2.5 text-sm leading-relaxed text-ink-muted">
          <li className="flex gap-2.5">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            Signature verification uses a constant-time comparison, so a wrong secret cannot be
            recovered by timing the endpoint.
          </li>
          <li className="flex gap-2.5">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            Installation tokens are short-lived and requested per review. Nothing long-lived is
            written to disk.
          </li>
          <li className="flex gap-2.5">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            This dashboard receives booleans, never secret values. Change a secret by editing{' '}
            <code className="font-mono text-ink-soft">.env</code> and restarting the service.
          </li>
        </ul>
      </section>
    </div>
  )
}

function ReviewTab({ config }: { config: ServiceSettings }) {
  return (
    <div className="space-y-7">
      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink">Automatic review</h2>
        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-muted">
          A pull request is reviewed when it is opened, reopened, marked ready for review, or
          receives new commits. Drafts are skipped until they are marked ready.
        </p>

        <div className="divide-y divide-line rounded-md border border-line px-5">
          <ReadOnlyRow
            label="Post comments to GitHub"
            value={config.post_comments ? 'enabled' : 'disabled'}
            hint="POST_COMMENTS — when off the review still runs and is recorded here, but nothing is written to the pull request."
          />
          <ReadOnlyRow
            label="Maximum comments per review"
            value={config.max_comments_per_review}
            hint="Findings are sorted worst-first and the tail is cut. Fifty comments on one pull request get ignored wholesale."
          />
          <ReadOnlyRow
            label="Maximum diff size"
            value={`${(config.max_diff_bytes / 1000).toFixed(0)} KB`}
            hint="MAX_DIFF_BYTES — the diff sent to the model is truncated past this, and the truncation is stated in the prompt."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink">Queue</h2>
        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-muted">
          GitHub retries a delivery that does not answer quickly, so the endpoint enqueues the job
          and returns. Workers drain the queue in the background.
        </p>

        <div className="divide-y divide-line rounded-md border border-line px-5">
          <ReadOnlyRow
            label="Backend"
            value={config.queue_backend}
            hint="memory keeps jobs in the process; redis lets them survive a restart and be shared between instances."
          />
          <ReadOnlyRow label="Workers" value={config.queue_workers} />
          <ReadOnlyRow
            label="Maximum retries"
            value={config.queue_max_retries}
            hint="A failed job is retried with a backoff, because the GitHub API and the model API both fail transiently."
          />
        </div>
      </section>
    </div>
  )
}

function AiTab({ config }: { config: ServiceSettings }) {
  return (
    <div className="space-y-7">
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-ink">AI review layer</h2>
          {config.anthropic_api_key_configured || config.ai_provider === 'mock' ? (
            <Badge tone="success" icon={Bot}>
              Active
            </Badge>
          ) : (
            <Badge tone="warning" icon={AlertTriangle}>
              No API key
            </Badge>
          )}
        </div>

        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-muted">
          The AI layer runs after the static rules and reads the same diff. It exists for the
          findings a rule cannot express: a retry that can double-charge a customer, a permission
          check that runs after the query it is meant to guard. Its output is merged with the
          static findings, deduplicated, and capped.
        </p>

        <div className="divide-y divide-line rounded-md border border-line px-5">
          <ReadOnlyRow
            label="Provider"
            value={config.ai_provider}
            hint="anthropic calls the API; mock returns a fixed response and costs nothing, which is what the tests use."
          />
          <ReadOnlyRow label="Model" value={config.ai_model} />
          <ReadOnlyRow
            label="Maximum response tokens"
            value={config.ai_max_tokens}
            hint="Caps what one review can cost."
          />
          <StatusRow
            label="API key"
            configured={config.anthropic_api_key_configured}
            required={config.ai_provider !== 'mock'}
            hint="ANTHROPIC_API_KEY — without it the pipeline still runs, with static analysis only."
          />
        </div>
      </section>

      <section className="rounded-md border border-accent/25 bg-accent/[0.06] p-5">
        <h3 className="mb-2 text-base font-semibold text-ink">Why both layers</h3>
        <p className="text-sm leading-relaxed text-ink-soft">
          The static layer is exact, free and instant, but it can only see patterns. The AI layer
          reads intent, but it is slower, costs money per review, and is occasionally wrong.
          Running both means the cheap checks never reach a human, and the expensive layer is spent
          only on what rules cannot decide.
        </p>
      </section>
    </div>
  )
}

function RulesTab({ rules, loading }: { rules: RuleMeta[]; loading: boolean }) {
  const [layer, setLayer] = useState<'all' | 'diff' | 'ast' | 'pull-request'>('all')

  if (loading) {
    return <div className="skeleton h-64 rounded-md" />
  }

  const filtered = layer === 'all' ? rules : rules.filter((rule) => rule.layer === layer)

  const layers = [
    { id: 'all' as const, label: `All (${rules.length})` },
    { id: 'diff' as const, label: 'Diff text' },
    { id: 'ast' as const, label: 'Syntax tree' },
    { id: 'pull-request' as const, label: 'Whole pull request' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-ink">
          <ListChecks className="h-5 w-5 text-ink-muted" aria-hidden />
          Static analysis rules
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          Every rule the analyser implements, read from the service rather than written here, so
          this list cannot drift from the code. Severity thresholds are set per rule in{' '}
          <code className="font-mono text-ink-soft">app/analysis/</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md border border-line bg-sunken p-1">
        {layers.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setLayer(option.id)}
            aria-pressed={layer === option.id}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium transition-colors',
              layer === option.id
                ? 'bg-accent text-accent-ink'
                : 'text-ink-muted hover:bg-raised hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2.5">
        {filtered.map((rule) => (
          <li key={rule.rule} className="rounded-md border border-line bg-raised p-4">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={rule.default_severity} size="sm" />
              <code className="font-mono text-sm font-semibold text-ink">{rule.rule}</code>
              <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                {rule.category}
              </span>
              <span className="ml-auto font-mono text-xs text-ink-muted">
                {rule.languages.join(', ')}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">{rule.description}</p>
            {rule.why_it_matters && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{rule.why_it_matters}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function NotificationsTab({
  value,
  onChange,
}: {
  value: { critical: boolean; weekly: boolean; failures: boolean }
  onChange: (next: { critical: boolean; weekly: boolean; failures: boolean }) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 text-lg font-semibold text-ink">Notification preferences</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          The service has no notification transport yet. These switches are kept in this browser so
          the preference survives a reload, and nothing is sent anywhere.
        </p>
      </div>

      <Panel className="border-warning/35">
        <PanelBody className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-soft">
            Not implemented in the backend. Today, the review itself is the notification: it is
            posted to the pull request, which sends the author GitHub's own email.
          </p>
        </PanelBody>
      </Panel>

      <div className="divide-y divide-line rounded-md border border-line px-5">
        <Toggle
          checked={value.critical}
          onChange={(next) => onChange({ ...value, critical: next })}
          label="A review finds a critical issue"
          description="Hard-coded secrets, mutable default arguments, and anything the AI layer rates as blocking."
        />
        <Toggle
          checked={value.failures}
          onChange={(next) => onChange({ ...value, failures: next })}
          label="A review fails after its retries"
          description="The queue gives up after the configured number of attempts."
        />
        <Toggle
          checked={value.weekly}
          onChange={(next) => onChange({ ...value, weekly: next })}
          label="Weekly quality summary"
          description="Score trend, finding volume and the rules that fired most."
        />
      </div>
    </div>
  )
}

function AccountTab({ config }: { config: ServiceSettings }) {
  return (
    <div className="space-y-7">
      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink">Account</h2>
        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-muted">
          This build has no user accounts and no login. The service identifies itself to GitHub as
          an App installation, so there is no personal identity to store, and this dashboard is
          expected to sit behind whatever the deployment puts in front of it.
        </p>

        <div className="divide-y divide-line rounded-md border border-line px-5">
          <ReadOnlyRow label="Environment" value={config.environment} />
          <ReadOnlyRow
            label="Example data"
            value={config.demo_data ? 'seeded' : 'off'}
            hint="DEMO_DATA — fills an empty store with example reviews so the dashboard has something to show. Records produced by a real webhook are never replaced."
          />
        </div>
      </section>

      <section className="rounded-md border border-warning/30 bg-warning/[0.06] p-5">
        <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-ink">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
          Before deploying this anywhere public
        </h3>
        <ul className="space-y-1.5 text-sm leading-relaxed text-ink-soft">
          <li>Set DEMO_DATA=false so the store holds only real reviews.</li>
          <li>Put authentication in front of the dashboard; the API has none of its own.</li>
          <li>Narrow CORS_ORIGINS to the host that serves the frontend.</li>
          <li>Use QUEUE_BACKEND=redis so queued reviews survive a restart.</li>
        </ul>
      </section>
    </div>
  )
}
