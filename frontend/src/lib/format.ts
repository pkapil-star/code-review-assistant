/** Formatting helpers shared across pages, so the same number reads the same way everywhere. */

import type { ReviewStatus, Severity } from '@/types'

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const seconds = Math.round((Date.now() - then) / 1000)

  if (Number.isNaN(seconds)) return '—'
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`
  if (seconds < 604800) return `${Math.round(seconds / 86400)} d ago`
  if (seconds < 2629800) return `${Math.round(seconds / 604800)} wk ago`

  return `${Math.round(seconds / 2629800)} mo ago`
}

export function absoluteTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

export function duration(seconds: number): string {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`

  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

export function percent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`
}

export function signed(value: number, digits = 1): string {
  const formatted = value.toFixed(digits)
  return value > 0 ? `+${formatted}` : formatted
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

export function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

export function directoryName(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

export function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  queued: 'Queued',
  reviewing: 'Reviewing',
  passed: 'Passed',
  needs_changes: 'Needs changes',
  critical: 'Critical',
  failed: 'Failed',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Critical',
  warning: 'Warning',
  info: 'Suggestion',
}

/**
 * Score bands.
 *
 * The same thresholds drive the colour of a score wherever it appears, so a 72
 * never reads as healthy in one panel and borderline in another.
 */
export function scoreBand(score: number): 'strong' | 'fair' | 'weak' {
  if (score >= 85) return 'strong'
  if (score >= 65) return 'fair'
  return 'weak'
}

export function scoreTone(score: number): 'success' | 'warning' | 'critical' {
  const band = scoreBand(score)
  return band === 'strong' ? 'success' : band === 'fair' ? 'warning' : 'critical'
}
