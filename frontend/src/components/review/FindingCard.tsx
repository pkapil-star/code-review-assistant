/**
 * One review finding, expanded.
 *
 * This is the component the whole product exists to render. A finding is only
 * useful if the reader can answer four questions from it: what is wrong, where,
 * why it matters, and what to do. Each has its own labelled section, and the
 * layer that produced it is stated, because a rule match and a model's judgement
 * warrant different amounts of trust.
 */

import { useState } from 'react'
import { ChevronDown, FileCode2, Lightbulb, Quote, Wrench } from 'lucide-react'
import { SeverityBadge, SourceBadge } from '@/components/ui/Badge'
import { highlightLine, languageFor } from '@/lib/highlight'
import { titleCase } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Finding, Severity } from '@/types'

const ACCENT: Record<Severity, string> = {
  error: 'border-l-critical',
  warning: 'border-l-warning',
  info: 'border-l-accent',
}

export function FindingCard({
  finding,
  defaultOpen = false,
  onJumpToLine,
  compact = false,
}: {
  finding: Finding
  defaultOpen?: boolean
  onJumpToLine?: (path: string, line: number) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const language = languageFor(finding.path)

  return (
    <article
      className={cn(
        'overflow-hidden rounded-md border border-l-[3px] border-line bg-surface transition-colors',
        ACCENT[finding.severity],
        open && 'border-line-strong',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-raised"
      >
        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} size="sm" />
            <SourceBadge source={finding.source} />
            {!compact && (
              <span className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                {finding.category}
              </span>
            )}
          </div>

          <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{finding.title}</h3>

          <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-xs text-ink-muted">
            <FileCode2 className="h-3.5 w-3.5" aria-hidden />
            <span className="truncate">{finding.path}</span>
            {finding.line !== null && (
              <span className="text-accent">:{finding.line}</span>
            )}
            <span aria-hidden>·</span>
            <span>{finding.rule}</span>
          </p>
        </div>
      </button>

      {open && (
        <div className="animate-fade-in space-y-5 border-t border-line px-4 py-4 pl-11">
          <Section label="What the review found">
            <p className="whitespace-pre-line">{finding.message}</p>
          </Section>

          {finding.snippet && (
            <Section label="In the diff" icon={Quote}>
              <pre className="overflow-x-auto rounded border border-line bg-sunken p-3 font-mono text-[0.8125rem] leading-relaxed">
                <code>{highlightLine(finding.snippet, language)}</code>
              </pre>
            </Section>
          )}

          {finding.why_it_matters && (
            <Section label="Why it matters" icon={Lightbulb}>
              <p className="whitespace-pre-line">{finding.why_it_matters}</p>
            </Section>
          )}

          {finding.suggested_fix && (
            <Section label="Suggested fix" icon={Wrench}>
              <SuggestedFix text={finding.suggested_fix} language={language} />
            </Section>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <span className="font-mono text-xs text-ink-muted">
              rule: {finding.rule} · category: {titleCase(finding.category)}
            </span>
            {onJumpToLine && finding.line !== null && (
              <button
                type="button"
                onClick={() => onJumpToLine(finding.path, finding.line as number)}
                className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                Show in the diff
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon?: typeof Lightbulb
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="label-caps mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </p>
      <div className="text-sm leading-relaxed text-ink-soft">{children}</div>
    </div>
  )
}

/**
 * Suggested fixes arrive as prose with an optional indented code block, which is
 * how the pipeline writes them. Splitting the two lets the code keep a mono face
 * without the explanation losing its line breaks.
 */
function SuggestedFix({ text, language }: { text: string; language: string }) {
  const [prose, ...rest] = text.split('\n\n')
  const code = rest.join('\n\n').trim()

  return (
    <>
      <p className="whitespace-pre-line">{prose}</p>
      {code && (
        <pre className="mt-2.5 overflow-x-auto rounded border border-success/25 bg-success/[0.06] p-3 font-mono text-[0.8125rem] leading-relaxed">
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
