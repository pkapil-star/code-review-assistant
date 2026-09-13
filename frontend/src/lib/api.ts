/**
 * The single place the browser talks to the service.
 *
 * Every call goes through `request`, so retries, error shaping and the base URL
 * are decided once. Components never call fetch directly; they call a named
 * function here, which keeps the set of endpoints the UI depends on visible in
 * one file.
 */

import type {
  AnalyticsPayload,
  ConnectionStatus,
  DashboardPayload,
  Decision,
  FindingsPayload,
  PullRequestDetail,
  PullRequestListItem,
  Repository,
  RuleMeta,
  ServiceSettings,
} from '@/types'

// Empty by default: FastAPI serves the built bundle, so the API is same-origin.
// Set VITE_API_BASE_URL when the frontend is hosted separately.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  /** True when the service answered, but said no. */
  get isClientError() {
    return this.status >= 400 && this.status < 500
  }

  /** True when the browser never reached the service at all. */
  get isOffline() {
    return this.status === 0
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the review service. Is the API running on port 8000?')
  }

  if (!response.ok) {
    let detail = `The service answered with HTTP ${response.status}.`

    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // A non-JSON error body is not worth surfacing; the status line is enough.
    }

    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export interface PullRequestQuery {
  query?: string
  repository?: string
  review_status?: string
  severity?: string
  sort?: 'updated' | 'score' | 'findings' | 'number'
}

function toSearchParams(query: PullRequestQuery): string {
  const params = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, String(value))
  })

  const search = params.toString()
  return search ? `?${search}` : ''
}

export const api = {
  status: () => request<ConnectionStatus>('/api/status'),
  settings: () => request<ServiceSettings>('/api/settings'),
  rules: () => request<RuleMeta[]>('/api/rules'),
  dashboard: () => request<DashboardPayload>('/api/dashboard'),
  analytics: (days = 30) => request<AnalyticsPayload>(`/api/analytics?days=${days}`),
  repositories: () => request<Repository[]>('/api/repositories'),
  repository: (id: string) => request<Repository>(`/api/repositories/${id}`),

  updateRepository: (id: string, body: { auto_review?: boolean; active?: boolean }) =>
    request<Repository>(`/api/repositories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  pullRequests: (query: PullRequestQuery = {}) =>
    request<PullRequestListItem[]>(`/api/pull-requests${toSearchParams(query)}`),

  pullRequest: (id: string) => request<PullRequestDetail>(`/api/pull-requests/${id}`),

  findings: (id: string) => request<FindingsPayload>(`/api/pull-requests/${id}/findings`),

  setDecision: (id: string, decision: Exclude<Decision, null> | 'cleared') =>
    request<PullRequestDetail>(`/api/pull-requests/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
}
