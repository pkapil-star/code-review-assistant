/**
 * Connected repositories.
 *
 * Each card carries the rolled-up health of the repository and the one control
 * that matters: whether the pipeline reviews its pull requests automatically.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ExternalLink,
  FolderGit2,
  GitBranch,
  Lock,
  RefreshCw,
  Unlock,
} from 'lucide-react'
import { Github } from '@/components/ui/icons'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { Button, ButtonAnchor, ButtonLink } from '@/components/ui/Button'
import { Badge, DemoBadge } from '@/components/ui/Badge'
import { Toggle } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useShell } from '@/components/layout/AppShell'
import { useApi } from '@/hooks/useApi'
import { useToast } from '@/hooks/useToast'
import { api } from '@/lib/api'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Repository } from '@/types'

export default function Repositories() {
  const { status } = useShell()
  const { push } = useToast()
  const { data, error, refetch, initialising } = useApi<Repository[]>(
    () => api.repositories(),
    [],
  )
  const [settingsFor, setSettingsFor] = useState<Repository | null>(null)
  const [saving, setSaving] = useState(false)

  if (initialising) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const repositories = data ?? []

  async function toggleAutoReview(repository: Repository, next: boolean) {
    setSaving(true)

    try {
      await api.updateRepository(repository.id, { auto_review: next })
      refetch()
      push({
        tone: next ? 'success' : 'warning',
        title: next ? 'Automatic review enabled' : 'Automatic review paused',
        description: next
          ? `New pull requests on ${repository.full_name} will be reviewed.`
          : 'Recorded here only. GitHub still delivers webhooks until the App is uninstalled from the repository.',
      })
    } catch {
      push({
        tone: 'critical',
        title: 'Could not save the setting',
        description: 'The review service did not accept the change.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Repositories"
        title="Connected repositories"
        description="Every repository the GitHub App is installed on, with the health rolled up from its reviews."
        actions={
          <>
            <Button icon={RefreshCw} onClick={refetch}>
              Refresh
            </Button>
            <ButtonAnchor
              href="https://github.com/settings/installations"
              variant="primary"
              icon={Github}
            >
              Manage the installation
            </ButtonAnchor>
          </>
        }
      />

      {!status?.connected && (
        <Panel className="mb-6 border-warning/40">
          <PanelBody className="flex flex-wrap items-center gap-4">
            <Badge tone="warning" icon={Github} size="lg">
              GitHub not configured
            </Badge>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">
              The App id, webhook secret or private key is missing, so no new repository can send
              events to the pipeline. Anything listed below came from earlier reviews or from the
              example data.
            </p>
            <ButtonLink to="/app/settings" variant="primary">
              Open settings
            </ButtonLink>
          </PanelBody>
        </Panel>
      )}

      {repositories.length === 0 ? (
        <Panel>
          <EmptyState
            icon={FolderGit2}
            title="No repositories are connected"
            description="Install the GitHub App on a repository. The first pull request event registers it here automatically."
            action={
              <ButtonAnchor
                href="https://github.com/settings/apps"
                variant="primary"
                icon={Github}
              >
                Install the GitHub App
              </ButtonAnchor>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {repositories.map((repository) => (
            <RepositoryCard
              key={repository.id}
              repository={repository}
              onOpenSettings={() => setSettingsFor(repository)}
              onToggle={(next) => toggleAutoReview(repository, next)}
              busy={saving}
            />
          ))}
        </div>
      )}

      <Modal
        open={settingsFor !== null}
        onClose={() => setSettingsFor(null)}
        title={settingsFor ? `${settingsFor.full_name} settings` : ''}
        description="Applies to this repository only."
        footer={<Button onClick={() => setSettingsFor(null)}>Done</Button>}
      >
        {settingsFor && (
          <div className="divide-y divide-line">
            <Toggle
              checked={settingsFor.auto_review}
              onChange={(next) => {
                setSettingsFor({ ...settingsFor, auto_review: next })
                toggleAutoReview(settingsFor, next)
              }}
              label="Review pull requests automatically"
              description="When on, every opened, reopened or updated pull request is queued for review."
            />
            <Toggle
              checked={settingsFor.active}
              onChange={() => undefined}
              disabled
              disabledReason="Set by the GitHub App installation, not by this dashboard."
              label="Installation active"
              description="Whether the App is currently installed on this repository."
            />
            <div className="py-4">
              <p className="text-sm font-semibold text-ink">Default branch</p>
              <p className="mt-1 font-mono text-sm text-ink-muted">
                {settingsFor.default_branch}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function RepositoryCard({
  repository,
  onOpenSettings,
  onToggle,
  busy,
}: {
  repository: Repository
  onOpenSettings: () => void
  onToggle: (next: boolean) => void
  busy: boolean
}) {
  const healthTone =
    repository.health_score >= 85
      ? 'text-success'
      : repository.health_score >= 65
        ? 'text-warning'
        : 'text-critical'

  const barTone =
    repository.health_score >= 85
      ? 'bg-success'
      : repository.health_score >= 65
        ? 'bg-warning'
        : 'bg-critical'

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[0.9375rem]">{repository.name}</span>
            {repository.is_demo && <DemoBadge />}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
            <span>{repository.owner}</span>
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" aria-hidden />
              {repository.default_branch}
            </span>
            <span className="flex items-center gap-1">
              {repository.private ? (
                <Lock className="h-3 w-3" aria-hidden />
              ) : (
                <Unlock className="h-3 w-3" aria-hidden />
              )}
              {repository.private ? 'private' : 'public'}
            </span>
            <span>{repository.language}</span>
          </span>
        }
        action={
          repository.active ? (
            <Badge tone="success" size="sm">
              Active
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm">
              Inactive
            </Badge>
          )
        }
      />

      <PanelBody className="flex-1 space-y-5">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="label-caps">Health score</span>
            <span className={cn('font-mono text-3xl font-semibold tabular-nums', healthTone)}>
              {repository.health_score || '—'}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
            <div
              className={cn('h-full rounded-full transition-[width] duration-700', barTone)}
              style={{ width: `${repository.health_score}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="label-caps">Reviews</dt>
            <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
              {repository.reviews_count}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Open findings</dt>
            <dd
              className={cn(
                'mt-1 font-mono text-xl font-semibold tabular-nums',
                repository.open_findings > 0 ? 'text-warning' : 'text-success',
              )}
            >
              {repository.open_findings}
            </dd>
          </div>
        </dl>

        <div className="border-t border-line pt-4">
          <p className="label-caps mb-1.5">Last reviewed</p>
          {repository.last_pull_request ? (
            <>
              <p className="truncate text-sm text-ink-soft">{repository.last_pull_request}</p>
              <p className="mt-0.5 font-mono text-xs text-ink-muted">
                {repository.last_reviewed_at ? relativeTime(repository.last_reviewed_at) : '—'}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">No pull request has been reviewed yet.</p>
          )}
        </div>

        <div className="border-t border-line">
          <Toggle
            checked={repository.auto_review}
            onChange={onToggle}
            disabled={busy}
            label="Automatic review"
            description="Queue every new pull request on this repository."
          />
        </div>
      </PanelBody>

      <footer className="flex flex-wrap items-center gap-2.5 border-t border-line px-5 py-4">
        <ButtonAnchor
          href={`https://github.com/${repository.full_name}`}
          size="sm"
          icon={ExternalLink}
        >
          Open repository
        </ButtonAnchor>
        <Button size="sm" onClick={onOpenSettings}>
          Review settings
        </Button>
        <Link
          to={`/app/pull-requests?repo=${encodeURIComponent(repository.full_name)}`}
          className="ml-auto text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          {repository.reviews_count} reviews
        </Link>
      </footer>
    </Panel>
  )
}
