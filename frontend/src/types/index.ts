/**
 * The shapes the FastAPI service returns.
 *
 * These mirror the pydantic models in app/store/records.py and app/routers/api.py.
 * Keeping them in one file means a backend change surfaces here as a type error
 * rather than as an undefined value halfway down a component tree.
 */

export type Severity = 'error' | 'warning' | 'info'

export type FindingSource = 'static' | 'ai'

export type ReviewStatus =
  | 'queued'
  | 'reviewing'
  | 'passed'
  | 'needs_changes'
  | 'critical'
  | 'failed'

export type Decision = 'approved' | 'changes_requested' | null

export interface Finding {
  id: string
  path: string
  line: number | null
  severity: Severity
  rule: string
  title: string
  message: string
  source: FindingSource
  category: string
  why_it_matters: string
  suggested_fix: string
  snippet: string | null
}

export interface DiffLine {
  kind: 'add' | 'remove' | 'context' | 'hunk'
  old_line: number | null
  new_line: number | null
  content: string
}

export interface DiffFile {
  path: string
  status: string
  language: string
  additions: number
  deletions: number
  lines: DiffLine[]
}

export interface QualityMetrics {
  cyclomatic_complexity: number
  max_function_length: number
  functions_changed: number
  documented_ratio: number
  duplication_ratio: number
  test_files_changed: number
  source_files_changed: number
  estimated_coverage_delta: number
  naming_violations: number
}

export interface SeverityCounts {
  error: number
  warning: number
  info: number
}

export interface PullRequestListItem {
  id: string
  number: number
  title: string
  author: string
  repository: string
  head_branch: string
  base_branch: string
  html_url: string
  status: ReviewStatus
  score: number
  files_reviewed: number
  additions: number
  deletions: number
  ai_used: boolean
  duration_seconds: number
  created_at: string
  updated_at: string
  decision: Decision
  is_demo: boolean
  counts: SeverityCounts
  findings_count: number
}

export interface PullRequestDetail {
  id: string
  number: number
  title: string
  author: string
  author_avatar: string | null
  repository: string
  head_branch: string
  base_branch: string
  head_sha: string
  html_url: string
  status: ReviewStatus
  score: number
  files_reviewed: number
  additions: number
  deletions: number
  ai_used: boolean
  posted: boolean
  summary: string
  duration_seconds: number
  created_at: string
  updated_at: string
  findings: Finding[]
  files: DiffFile[]
  metrics: QualityMetrics
  decision: Decision
  error: string | null
  is_demo: boolean
}

export interface Repository {
  id: string
  name: string
  owner: string
  full_name: string
  default_branch: string
  private: boolean
  language: string
  auto_review: boolean
  active: boolean
  reviews_count: number
  open_findings: number
  health_score: number
  last_reviewed_at: string | null
  last_pull_request: string | null
  is_demo: boolean
}

export interface RuleMeta {
  rule: string
  title: string
  category: string
  default_severity: Severity
  layer: 'diff' | 'ast' | 'pull-request'
  languages: string[]
  description: string
  why_it_matters: string
  suggested_fix: string
}

export interface ConnectionStatus {
  connected: boolean
  app_id_configured: boolean
  webhook_secret_configured: boolean
  private_key_configured: boolean
  ai_provider: string
  ai_configured: boolean
  post_comments: boolean
  queue_backend: string
  workers_running: boolean
  environment: string
  demo_data: boolean
}

export interface ServiceSettings {
  environment: string
  ai_provider: string
  ai_model: string
  ai_max_tokens: number
  max_comments_per_review: number
  max_diff_bytes: number
  post_comments: boolean
  queue_backend: string
  queue_workers: number
  queue_max_retries: number
  github_api_url: string
  github_app_id_configured: boolean
  github_webhook_secret_configured: boolean
  github_private_key_configured: boolean
  anthropic_api_key_configured: boolean
  demo_data: boolean
}

export interface Summary {
  pull_requests_reviewed: number
  issues_detected: number
  critical_issues: number
  warnings: number
  suggestions: number
  average_score: number
  average_duration_seconds: number
  ai_reviews: number
  repositories: number
  needs_attention: number
}

export interface TimeseriesPoint {
  date: string
  reviews: number
  findings: number
  critical: number
  average_score: number | null
  average_duration: number | null
}

export interface ActivityItem {
  id: string
  repository: string
  number: number
  title: string
  status: ReviewStatus
  score: number
  ai_used: boolean
  findings: number
  critical: number
  at: string
}

export interface DashboardPayload {
  summary: Summary
  recent: PullRequestListItem[]
  needs_attention: PullRequestListItem[]
  activity: ActivityItem[]
  severity_distribution: { severity: Severity; count: number }[]
  category_distribution: { category: string; count: number }[]
  source_distribution: { source: FindingSource; count: number }[]
  top_rules: { rule: string; count: number }[]
  timeseries: TimeseriesPoint[]
  repositories: Repository[]
}

export interface AnalyticsPayload {
  summary: Summary
  timeseries: TimeseriesPoint[]
  severity_distribution: { severity: Severity; count: number }[]
  category_distribution: { category: string; count: number }[]
  source_distribution: { source: FindingSource; count: number }[]
  top_rules: { rule: string; count: number }[]
  repositories: {
    repository: string
    reviews: number
    health_score: number
    findings: number
    critical: number
    average_duration: number
  }[]
  complexity: {
    repository: string
    pull_request: number
    complexity: number
    score: number
    findings: number
  }[]
}

export interface FindingsPayload {
  total: number
  counts: SeverityCounts
  by_source: { static: Finding[]; ai: Finding[] }
  findings: Finding[]
}
