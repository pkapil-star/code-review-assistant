/**
 * Every analysed pull request, with the filters a reviewer actually reaches for.
 *
 * Filter state lives in the URL so a filtered view can be linked to and so the
 * browser's back button works the way a reader expects. The query goes to the
 * API rather than being applied in the browser, which keeps the behaviour the
 * same once the list outgrows a single response.
 */

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, GitPullRequest, Inbox, RefreshCw, SearchX } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SearchInput, Select } from '@/components/ui/Form'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States'
import { PullRequestTable } from '@/components/review/PullRequestTable'
import { useShell } from '@/components/layout/AppShell'
import { useApi } from '@/hooks/useApi'
import { api } from '@/lib/api'
import type { PullRequestListItem } from '@/types'

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'critical', label: 'Critical' },
  { value: 'needs_changes', label: 'Needs changes' },
  { value: 'passed', label: 'Passed' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'failed', label: 'Failed' },
]

const SEVERITY_OPTIONS = [
  { value: '', label: 'Any severity' },
  { value: 'error', label: 'Has critical findings' },
  { value: 'warning', label: 'Has warnings' },
  { value: 'info', label: 'Has suggestions' },
]

const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'score', label: 'Highest score' },
  { value: 'findings', label: 'Most findings' },
  { value: 'number', label: 'Newest pull request' },
]

const AGE_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
]

export default function PullRequests() {
  const [params, setParams] = useSearchParams()
  const { repositories, repositoryFilter } = useShell()

  const query = params.get('q') ?? ''
  const statusFilter = params.get('status') ?? ''
  const severity = params.get('severity') ?? ''
  const sort = (params.get('sort') ?? 'updated') as 'updated' | 'score' | 'findings' | 'number'
  const age = params.get('age') ?? ''
  // The top bar picker wins unless this page names a repository of its own.
  const repository = params.get('repo') ?? (repositoryFilter === 'all' ? '' : repositoryFilter)

  function update(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const { data, error, loading, refetch, initialising } = useApi<PullRequestListItem[]>(
    () =>
      api.pullRequests({
        query,
        repository,
        review_status: statusFilter,
        severity,
        sort,
      }),
    [query, repository, statusFilter, severity, sort],
  )

  // Date filtering is the one predicate the API does not take, so it is applied
  // here rather than adding a parameter the backend does not yet support.
  const items = useMemo(() => {
    if (!data) return []
    if (!age) return data

    const cutoff = Date.now() - Number(age) * 86_400_000
    return data.filter((item) => new Date(item.updated_at).getTime() >= cutoff)
  }, [data, age])

  const activeFilters = [query, statusFilter, severity, age, params.get('repo')].filter(Boolean).length

  return (
    <>
      <PageHeader
        eyebrow="Pull requests"
        title="Analysed pull requests"
        description="Every pull request the pipeline has processed, newest first. Open one to see the diff beside the findings."
        actions={
          <Button icon={RefreshCw} onClick={refetch} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <Panel>
        <PanelHeader
          title="Filters"
          icon={Filter}
          description={
            activeFilters > 0
              ? `${activeFilters} filter${activeFilters > 1 ? 's' : ''} applied · ${items.length} result${items.length === 1 ? '' : 's'}`
              : `${items.length} pull request${items.length === 1 ? '' : 's'}`
          }
          action={
            activeFilters > 0 && (
              <Button size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            )
          }
        />
        <PanelBody>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SearchInput
              className="md:col-span-2 xl:col-span-1"
              value={query}
              onChange={(value) => update('q', value)}
              placeholder="Title, author, branch or number"
              label="Search pull requests"
            />

            <Select
              label="Repository"
              value={params.get('repo') ?? ''}
              onChange={(event) => update('repo', event.target.value)}
            >
              <option value="">
                {repositoryFilter === 'all' ? 'All repositories' : `Top bar: ${repositoryFilter}`}
              </option>
              {repositories.map((entry) => (
                <option key={entry.id} value={entry.full_name}>
                  {entry.full_name}
                </option>
              ))}
            </Select>

            <Select
              label="Status"
              value={statusFilter}
              onChange={(event) => update('status', event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Select
              label="Severity"
              value={severity}
              onChange={(event) => update('severity', event.target.value)}
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Updated"
                value={age}
                onChange={(event) => update('age', event.target.value)}
              >
                {AGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Select
                label="Sort"
                value={sort}
                onChange={(event) => update('sort', event.target.value)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </PanelBody>
      </Panel>

      <Panel className="mt-6">
        {initialising ? (
          <TableSkeleton rows={7} />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : items.length === 0 ? (
          activeFilters > 0 ? (
            <EmptyState
              icon={SearchX}
              title="No pull requests match these filters"
              description="Widen the search, clear a filter, or pick a different repository in the top bar."
              action={
                <Button
                  variant="primary"
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No pull requests have been analysed yet"
              description="The pipeline records a pull request the first time a verified webhook arrives for it."
            />
          )
        ) : (
          <>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  <GitPullRequest className="h-[18px] w-[18px] text-ink-muted" aria-hidden />
                  {items.length} pull request{items.length === 1 ? '' : 's'}
                </span>
              }
            />
            <PanelBody flush>
              <PullRequestTable items={items} />
            </PanelBody>
          </>
        )}
      </Panel>
    </>
  )
}
