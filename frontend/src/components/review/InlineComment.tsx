/**
 * A finding rendered where GitHub would put a review comment.
 *
 * It shows the headline and the explanation by default and hides the reasoning
 * and the fix behind a disclosure, so a long file of findings stays scannable.
 */

import { useState } from 'react'
import { Bot, ScanLine, Wrench } from 'lucide-react'
import { SeverityBadge } from '@/components/ui/Badge'
import { highlightLine, languageFor } from '@/lib/highlight'
import { cn } from '@/lib/cn'
import type { Finding, Severity } from '@/types'

const EDGE: Record<Severity, string> = {
  error: 'border-critical/40',
  warning: 'border-warning/40',
  info: 'border-accent/35',
}

export function InlineComment({
  finding,
  onDismissHighlight,
}: {
  finding: Finding
  onDismissHighlight?: () => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const Icon = finding.source === 'ai' ? Bot : ScanLine
  const hasDetail = Boolean(finding.why_it_matters || finding.suggested_fix)

  return (
    <div className={cn('rounded-md border bg-surface p-3 font-sans', EDGE[finding.severity])}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink-muted">
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {finding.source === 'ai' ? 'AI review' : 'Static analysis'}
        </span>
        <SeverityBadge severity={finding.severity} size="sm" />
        <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink-muted">
          {finding.rule}
        </span>

        {onDismissHighlight && (
          <button
            type="button"
            onClick={onDismissHighlight}
            className="ml-auto text-xs font-semibold text-accent underline-offset-4 hover:underline"
          >
            Clear highlight
          </button>
        )}
      </div>

      <p className="mt-2 text-sm font-semibold text-ink">{finding.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{finding.message}</p>

      {hasDetail && (
        <>
          <button
            type="button"
            onClick={() => setShowDetail((value) => !value)}
            aria-expanded={showDetail}
            className="mt-2.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            {showDetail ? 'Hide the reasoning' : 'Why it matters and how to fix it'}
          </button>

          {showDetail && (
            <div className="mt-3 animate-fade-in space-y-3 border-t border-line pt-3">
              {finding.why_it_matters && (
                <p className="text-sm leading-relaxed text-ink-soft">{finding.why_it_matters}</p>
              )}
              {finding.suggested_fix && (
                <div>
                  <p className="label-caps mb-1.5 flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" aria-hidden />
                    Suggested fix
                  </p>
                  <FixBlock text={finding.suggested_fix} language={languageFor(finding.path)} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FixBlock({ text, language }: { text: string; language: string }) {
  const [prose, ...rest] = text.split('\n\n')
  const code = rest.join('\n\n').trim()

  return (
    <>
      <p className="text-sm leading-relaxed text-ink-soft">{prose}</p>
      {code && (
        <pre className="mt-2 overflow-x-auto rounded border border-success/25 bg-success/[0.06] p-2.5 font-mono text-xs leading-relaxed">
          <code>
            {code.split('\n').map((line, index) => (
              <div key={index}>{highlightLine(line.replace(/^ {4}/, ''), language)}</div>
            ))}
          </code>
        </pre>
      )}
    </>
  )
}
