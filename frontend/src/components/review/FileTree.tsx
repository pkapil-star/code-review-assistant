/**
 * The changed-file list beside the diff.
 *
 * Files are grouped by directory because a reviewer navigates by area, not by
 * alphabetical path, and each entry carries its finding count so the file that
 * needs attention is obvious before any of them is opened.
 */

import { useMemo } from 'react'
import { FileCode2, Folder } from 'lucide-react'
import { directoryName, fileName } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { DiffFile, Finding } from '@/types'

export function FileTree({
  files,
  findings,
  activePath,
  onSelect,
}: {
  files: DiffFile[]
  findings: Finding[]
  activePath: string | null
  onSelect: (path: string) => void
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, DiffFile[]>()

    files.forEach((file) => {
      const directory = directoryName(file.path) || '/'
      groups.set(directory, [...(groups.get(directory) ?? []), file])
    })

    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [files])

  if (files.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-ink-muted">
        The diff for this pull request is not stored locally. Findings still list the file and
        line they refer to.
      </p>
    )
  }

  return (
    <nav aria-label="Changed files" className="py-2">
      {grouped.map(([directory, entries]) => (
        <div key={directory} className="mb-2 last:mb-0">
          <p className="flex items-center gap-1.5 px-4 py-1.5 font-mono text-xs text-ink-muted">
            <Folder className="h-3.5 w-3.5" aria-hidden />
            <span className="truncate">{directory}</span>
          </p>

          <ul>
            {entries.map((file) => {
              const fileFindings = findings.filter((finding) => finding.path === file.path)
              const criticals = fileFindings.filter((f) => f.severity === 'error').length
              const active = file.path === activePath

              return (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => onSelect(file.path)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 px-4 py-2 pl-7 text-left transition-colors',
                      active
                        ? 'bg-accent/12 text-ink shadow-[inset_2px_0_0_0_rgb(var(--accent))]'
                        : 'text-ink-soft hover:bg-raised hover:text-ink',
                    )}
                  >
                    <FileCode2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {fileName(file.path)}
                    </span>

                    {fileFindings.length > 0 && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold tabular-nums',
                          criticals > 0
                            ? 'bg-critical/15 text-critical'
                            : 'bg-warning/15 text-warning',
                        )}
                        title={`${fileFindings.length} finding(s)`}
                      >
                        {fileFindings.length}
                      </span>
                    )}

                    <span className="shrink-0 font-mono text-[0.6875rem] text-ink-muted">
                      <span className="text-success">+{file.additions}</span>{' '}
                      <span className="text-critical">-{file.deletions}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
