/**
 * The diff viewer, with review findings anchored to the lines they refer to.
 *
 * The layout follows what a reviewer already knows from GitHub: line numbers in
 * a gutter, added and removed lines tinted, and comments interleaved directly
 * under the line they are about. Findings are grouped by line before rendering
 * so several findings on one line appear together rather than pushing the code
 * apart repeatedly.
 */

import { Fragment, useMemo, useState } from 'react'
import { ChevronRight, FileCode2, MessageSquareCode } from 'lucide-react'
import { InlineComment } from './InlineComment'
import { highlightLine } from '@/lib/highlight'
import { cn } from '@/lib/cn'
import type { DiffFile, Finding } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  added: 'added',
  modified: 'modified',
  removed: 'deleted',
  renamed: 'renamed',
}

export function CodeDiffViewer({
  files,
  findings,
  highlightedLine,
  onClearHighlight,
}: {
  files: DiffFile[]
  findings: Finding[]
  /** Set when a finding elsewhere on the page asked the diff to scroll to a line. */
  highlightedLine?: { path: string; line: number } | null
  onClearHighlight?: () => void
}) {
  return (
    <div className="space-y-4">
      {files.map((file) => (
        <DiffFilePanel
          key={file.path}
          file={file}
          findings={findings.filter((finding) => finding.path === file.path)}
          highlightedLine={
            highlightedLine?.path === file.path ? highlightedLine.line : null
          }
          onClearHighlight={onClearHighlight}
        />
      ))}
    </div>
  )
}

function DiffFilePanel({
  file,
  findings,
  highlightedLine,
  onClearHighlight,
}: {
  file: DiffFile
  findings: Finding[]
  highlightedLine: number | null
  onClearHighlight?: () => void
}) {
  // A file the reader was sent to has to open even if they had collapsed it.
  const [collapsed, setCollapsed] = useState(false)
  const open = !collapsed || highlightedLine !== null

  const byLine = useMemo(() => {
    const map = new Map<number, Finding[]>()

    findings.forEach((finding) => {
      if (finding.line === null) return
      const bucket = map.get(finding.line) ?? []
      bucket.push(finding)
      map.set(finding.line, bucket)
    })

    return map
  }, [findings])

  const unanchored = findings.filter((finding) => finding.line === null)
  const criticals = findings.filter((finding) => finding.severity === 'error').length

  return (
    <section
      id={`file-${file.path}`}
      className="scroll-mt-24 overflow-hidden rounded-lg border border-line bg-surface shadow-panel"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-raised px-3 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200',
              open && 'rotate-90',
            )}
            aria-hidden
          />
          <FileCode2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <span className="truncate font-mono text-sm font-medium text-ink">{file.path}</span>
          <span className="shrink-0 rounded border border-line bg-sunken px-1.5 font-mono text-xs text-ink-muted">
            {STATUS_LABEL[file.status] ?? file.status}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-3 font-mono text-xs">
          {findings.length > 0 && (
            <span
              className={cn(
                'flex items-center gap-1.5',
                criticals > 0 ? 'text-critical' : 'text-warning',
              )}
            >
              <MessageSquareCode className="h-3.5 w-3.5" aria-hidden />
              {findings.length}
            </span>
          )}
          <span className="text-success">+{file.additions}</span>
          <span className="text-critical">-{file.deletions}</span>
        </div>
      </header>

      {open && (
        <>
          {unanchored.length > 0 && (
            <div className="space-y-2 border-b border-line bg-sunken/60 p-3">
              <p className="label-caps">Findings about the file as a whole</p>
              {unanchored.map((finding) => (
                <InlineComment key={finding.id} finding={finding} />
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse font-mono text-[0.8125rem] leading-[1.7]">
              <caption className="sr-only">Diff of {file.path}</caption>
              <tbody>
                {file.lines.map((line, index) => {
                  const lineFindings =
                    line.new_line !== null ? byLine.get(line.new_line) ?? [] : []
                  const isTarget = line.new_line !== null && line.new_line === highlightedLine

                  if (line.kind === 'hunk') {
                    return (
                      <tr key={index} className="bg-accent/[0.07]">
                        <td colSpan={3} className="px-3 py-1 text-xs text-accent">
                          {line.content}
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <Fragment key={index}>
                      <tr
                        id={isTarget ? 'diff-target' : undefined}
                        ref={
                          isTarget
                            ? (node) => {
                                node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                              }
                            : undefined
                        }
                        className={cn(
                          'group',
                          line.kind === 'add' && 'bg-success/[0.08]',
                          line.kind === 'remove' && 'bg-critical/[0.08]',
                          isTarget && 'bg-accent/[0.16] outline outline-1 outline-accent/50',
                        )}
                      >
                        <LineNumber value={line.old_line} />
                        <LineNumber value={line.new_line} />
                        <td className="w-full whitespace-pre px-3 text-ink-soft">
                          <span
                            className={cn(
                              'select-none pr-1',
                              line.kind === 'add' && 'text-success',
                              line.kind === 'remove' && 'text-critical',
                              line.kind === 'context' && 'text-transparent',
                            )}
                            aria-hidden
                          >
                            {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
                          </span>
                          {highlightLine(line.content, file.language)}
                        </td>
                      </tr>

                      {lineFindings.length > 0 && (
                        <tr>
                          <td colSpan={3} className="bg-canvas px-3 py-2.5">
                            <div className="space-y-2">
                              {lineFindings.map((finding) => (
                                <InlineComment
                                  key={finding.id}
                                  finding={finding}
                                  onDismissHighlight={isTarget ? onClearHighlight : undefined}
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function LineNumber({ value }: { value: number | null }) {
  return (
    <td className="w-12 select-none border-r border-line px-2 text-right align-top text-ink-muted">
      {value ?? ''}
    </td>
  )
}
